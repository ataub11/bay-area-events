#!/usr/bin/env node

const { Pool } = require('pg');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}✗${colors.reset} ${msg}`)
};

async function callHuggingFaceAPI(prompt) {
  const response = await fetch(
    'https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta',
    {
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 2000,
          temperature: 0.7,
          top_p: 0.9
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Hugging Face API error: ${response.status} ${error}`);
  }

  const result = await response.json();
  if (Array.isArray(result)) {
    return result[0]?.generated_text || '';
  }
  return result.generated_text || '';
}

async function generateEvents(regions, eventTypes) {
  log.info(`Generating events for: ${regions.join(', ')}`);
  
  const enabledTypes = Object.entries(eventTypes)
    .filter(([_, enabled]) => enabled)
    .map(([type, _]) => type)
    .join(', ');

  const prompt = `Generate a curated list of social events for THIS WEEKEND in the Bay Area for people in their 20s.

Regions: ${regions.join(', ')}
Event types: ${enabledTypes}
Constraints: All within 2 hours of Mountain View, weekend only (Fri-Sun)

Format as JSON ONLY:
{
  "events": [
    {
      "title": "Event name",
      "type": "trivia|socialMeal|sport|game",
      "location": "City, Venue",
      "region": "San Francisco|South Bay|East Bay|Peninsula",
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "duration": 2,
      "description": "Brief description",
      "costRange": "$",
      "friendType": "meetNewPeople|bestWithFriends|either",
      "distance": "XX miles from Mountain View"
    }
  ]
}

Generate 3-4 REALISTIC events with real venues.`;

  try {
    log.info('Calling Hugging Face API (FREE!)...');
    const responseText = await callHuggingFaceAPI(prompt);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Failed to parse response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    log.success(`Generated ${parsed.events?.length || 0} events`);
    return parsed.events || [];
  } catch (error) {
    log.error(`Hugging Face API error: ${error.message}`);
    throw error;
  }
}

function groupEventsByRegion(events) {
  const grouped = {};
  events.forEach(event => {
    if (!grouped[event.region]) grouped[event.region] = [];
    grouped[event.region].push(event);
  });
  return grouped;
}

function generateEmailHTML(events, subscriber) {
  const groupedByRegion = groupEventsByRegion(events);
  
  let eventHTML = '';
  
  for (const [region, regionEvents] of Object.entries(groupedByRegion)) {
    eventHTML += `
    <div style="margin: 30px 0; border-left: 4px solid #667eea; padding-left: 20px;">
      <h2 style="color: #333; margin-top: 0;">📍 ${region}</h2>
      ${regionEvents.map(event => `
        <div style="background: #f9f9f9; border-radius: 8px; padding: 15px; margin: 15px 0; border: 1px solid #e0e0e0;">
          <h3 style="margin: 0 0 10px 0; color: #333;">${event.title}</h3>
          <div style="margin-bottom: 10px;">
            <span style="display: inline-block; padding: 5px 10px; background: #667eea; color: white; border-radius: 20px; font-size: 12px; margin-right: 8px;">${event.type}</span>
            <span style="display: inline-block; padding: 5px 10px; background: #667eea; color: white; border-radius: 20px; font-size: 12px;">${event.costRange}</span>
          </div>
          <div style="font-size: 14px; color: #666; margin: 5px 0;">📅 ${event.date} at ${event.time}</div>
          <div style="font-size: 14px; color: #666; margin: 5px 0;">⏱️ ${event.duration}h</div>
          <div style="font-size: 14px; color: #666; margin: 5px 0;">📍 ${event.location}</div>
          <div style="margin-top: 10px; color: #555;">${event.description}</div>
        </div>
      `).join('')}
    </div>`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Segoe UI, Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; text-align: center; margin-bottom: 30px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #999; border-top: 1px solid #e0e0e0; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 This Weekend's Best Events</h1>
      <p>Your curated guide to social activities in the Bay Area</p>
    </div>
    ${eventHTML}
    <div class="footer">
      <p>Happy exploring! 🚀</p>
    </div>
  </div>
</body>
</html>`;
}

async function sendWeeklyDigest() {
  try {
    log.info('Starting weekly digest (Hugging Face FREE!)...');
    console.log('');
    
    const result = await pool.query(`
      SELECT 
        u.id,
        u.email,
        up.event_types,
        up.regions
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      JOIN user_preferences up ON u.id = up.user_id
      WHERE s.is_active = true
    `);

    const subscribers = result.rows;
    log.success(`Found ${subscribers.length} subscribers`);
    
    if (subscribers.length === 0) {
      log.warn('No active subscribers - add test subscriber to database');
      await pool.end();
      return;
    }

    console.log('');
    
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < subscribers.length; i++) {
      const subscriber = subscribers[i];
      
      try {
        log.info(`[${i + 1}/${subscribers.length}] Processing ${subscriber.email}...`);

        const regions = subscriber.regions || ['San Francisco', 'South Bay', 'East Bay', 'Peninsula'];
        const eventTypes = subscriber.event_types || {
          trivia: true,
          socialMeals: true,
          sports: true,
          games: true
        };

        const events = await generateEvents(regions, eventTypes);

        if (!events || events.length === 0) {
          log.warn(`  No events, skipping`);
          continue;
        }

        const html = generateEmailHTML(events, subscriber);

        await sgMail.send({
          to: subscriber.email,
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@bayarea.events',
          subject: '🎉 Your Weekend Events Guide - Bay Area',
          html: html
        });

        log.success(`  Email sent`);
        successCount++;

        await pool.query(
          `INSERT INTO email_logs (user_id, status) VALUES ($1, $2)`,
          [subscriber.id, 'sent']
        );

      } catch (error) {
        log.error(`  Error: ${error.message}`);
        failureCount++;
        
        try {
          await pool.query(
            `INSERT INTO email_logs (user_id, status) VALUES ($1, $2)`,
            [subscriber.id, `failed: ${error.message.substring(0, 100)}`]
          );
        } catch (logError) {
          // ignore
        }
      }
    }

    console.log('');
    log.success(`Complete! Sent: ${successCount}, Failed: ${failureCount}`);
    await pool.end();
    process.exit(successCount > 0 ? 0 : 1);

  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

sendWeeklyDigest();
