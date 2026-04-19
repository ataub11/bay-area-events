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

// Hardcoded events - update these manually each week!
const getWeekendEvents = () => {
  const today = new Date();
  const friday = new Date(today);
  friday.setDate(today.getDate() + (5 - today.getDay()));
  const fridayStr = friday.toISOString().split('T')[0];

  const saturday = new Date(friday);
  saturday.setDate(saturday.getDate() + 1);
  const saturdayStr = saturday.toISOString().split('T')[0];

  const sunday = new Date(saturday);
  sunday.setDate(sunday.getDate() + 1);
  const sundayStr = sunday.toISOString().split('T')[0];

  return [
    // San Francisco
    {
      title: "Pub Trivia Night at The Ramp",
      type: "trivia",
      location: "The Ramp, San Francisco",
      region: "San Francisco",
      date: fridayStr,
      time: "19:00",
      duration: 2,
      description: "Weekly trivia night with food and drinks. Great way to meet people!",
      costRange: "$",
      friendType: "meetNewPeople",
      distance: "10 miles from Mountain View"
    },
    {
      title: "Weekend Sports Bar Hangout",
      type: "sports",
      location: "Sports Bar, San Francisco",
      region: "San Francisco",
      date: saturdayStr,
      time: "18:00",
      duration: 3,
      description: "Watch games, drink beer, meet new people. Casual vibe.",
      costRange: "$",
      friendType: "either",
      distance: "10 miles from Mountain View"
    },

    // South Bay
    {
      title: "Board Game Night",
      type: "games",
      location: "Game Cafe, Mountain View",
      region: "South Bay",
      date: fridayStr,
      time: "19:00",
      duration: 3,
      description: "Community board game night. Bring friends or meet new ones!",
      costRange: "$",
      friendType: "either",
      distance: "0 miles from Mountain View"
    },
    {
      title: "Social Dinner & Drinks",
      type: "socialMeal",
      location: "Downtown Palo Alto",
      region: "South Bay",
      date: saturdayStr,
      time: "19:30",
      duration: 2,
      description: "Group dinner for 20-somethings. All dietary restrictions welcome.",
      costRange: "$$",
      friendType: "meetNewPeople",
      distance: "5 miles from Mountain View"
    },

    // East Bay
    {
      title: "Comedy Show & Drinks",
      type: "trivia",
      location: "Comedy Club, Oakland",
      region: "East Bay",
      date: saturdayStr,
      time: "20:00",
      duration: 2,
      description: "Stand-up comedy with drink specials. Great crowd.",
      costRange: "$$",
      friendType: "either",
      distance: "30 miles from Mountain View"
    },
    {
      title: "Volleyball Tournament",
      type: "sports",
      location: "Beach Volleyball, Berkeley",
      region: "East Bay",
      date: sundayStr,
      time: "10:00",
      duration: 3,
      description: "Casual 4v4 volleyball. Mixed skill levels. Free to join!",
      costRange: "Free",
      friendType: "meetNewPeople",
      distance: "35 miles from Mountain View"
    },

    // Peninsula
    {
      title: "Tech Networking Happy Hour",
      type: "socialMeal",
      location: "Hotel Restaurant, San Mateo",
      region: "Peninsula",
      date: fridayStr,
      time: "17:30",
      duration: 2,
      description: "Network with other young professionals in tech.",
      costRange: "$$",
      friendType: "meetNewPeople",
      distance: "15 miles from Mountain View"
    },
    {
      title: "Hiking & Picnic",
      type: "sports",
      location: "Filoli Gardens, Woodside",
      region: "Peninsula",
      date: sundayStr,
      time: "09:00",
      duration: 4,
      description: "Easy hike with scenic views, bring a picnic!",
      costRange: "$",
      friendType: "either",
      distance: "20 miles from Mountain View"
    }
  ];
};

function groupEventsByRegion(events) {
  const grouped = {};
  events.forEach(event => {
    if (!grouped[event.region]) grouped[event.region] = [];
    grouped[event.region].push(event);
  });
  return grouped;
}

function generateEmailHTML(events) {
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
      <p>Have fun! See you next week! 🚀</p>
    </div>
  </div>
</body>
</html>`;
}

async function sendWeeklyDigest() {
  try {
    log.info('Starting weekly digest...');
    console.log('');
    
    const result = await pool.query(`
      SELECT 
        u.id,
        u.email
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      WHERE s.is_active = true
    `);

    const subscribers = result.rows;
    log.success(`Found ${subscribers.length} subscribers`);
    
    if (subscribers.length === 0) {
      log.warn('No active subscribers');
      await pool.end();
      return;
    }

    console.log('');
    
    // Get this weekend's events
    const events = getWeekendEvents();
    log.success(`Loaded ${events.length} events`);

    let successCount = 0;

    for (let i = 0; i < subscribers.length; i++) {
      const subscriber = subscribers[i];
      
      try {
        log.info(`[${i + 1}/${subscribers.length}] Sending to ${subscriber.email}...`);

        const html = generateEmailHTML(events);

        await sgMail.send({
          to: subscriber.email,
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@bayarea.events',
          subject: '🎉 Your Weekend Events Guide - Bay Area',
          html: html
        });

        log.success(`  Email sent!`);
        successCount++;

        await pool.query(
          `INSERT INTO email_logs (user_id, status) VALUES ($1, $2)`,
          [subscriber.id, 'sent']
        );

      } catch (error) {
        log.error(`  Error: ${error.message}`);
        
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
    log.success(`Complete! Sent: ${successCount}/${subscribers.length}`);
    await pool.end();
    process.exit(successCount > 0 ? 0 : 1);

  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

sendWeeklyDigest();
