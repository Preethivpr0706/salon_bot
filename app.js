require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory storage for user sessions
const userSessions = new Map();

// Bot configuration
const BOT_CONFIG = {
  salonName: "Glamour Salon & Spa",
  services: [
    { emoji: "✨", name: "Bleach", description: "Skin lightening" },
    { emoji: "🧼", name: "Clean up", description: "Basic skin cleansing" },
    { emoji: "☀️", name: "Detan", description: "Tan removal" },
    { emoji: "🌸", name: "Facial", description: "Skin glow, hydration" },
    { emoji: "🎨", name: "Hair Colouring", description: "Coloring, grey coverage" },
    { emoji: "💆‍♂️", name: "Hair Spa", description: "Deep conditioning, shine" },
    { emoji: "🧴", name: "Hair Treatment", description: "Hair fall, dandruff care" },
    { emoji: "✂️", name: "Haircut", description: "Cuts, styling" },
    { emoji: "💆", name: "Head Massage", description: "Relaxing scalp massage" },
    { emoji: "💅", name: "Manicure", description: "Hand grooming, nails" },
    { emoji: "💄", name: "Party Makeup", description: "Makeup for events" },
    { emoji: "🦶", name: "Pedicure", description: "Foot care, nails" }
  ],
  flowId: process.env.WHATSAPP_FLOW_ID || "1374935687607261"
};

// Helper function to create session
function getOrCreateSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      step: 'welcome',
      data: {}
    });
  }
  return userSessions.get(userId);
}

// Message templates
const messageTemplates = {
  welcome: (userName = "there") => ({
    type: 'interactive',
    body: `✨ Welcome to ${BOT_CONFIG.salonName}! ✨\n\nHello ${userName}! 👋\n\nWe're delighted to help you book your perfect salon experience. What would you like to do today?`,
    buttons: [
      { id: 'view_services', title: '📋 View Services' },
      { id: 'book_appointment', title: '📅 Book Appointment' }
    ]
  }),

  services: () => ({
    type: 'interactive',
    body: `💼 Our Services\n\n${BOT_CONFIG.services.map(s => 
      `${s.emoji} ${s.name}\n   ${s.description}` 
    ).join('\n\n')}\n\nReady to book your appointment?`,
    buttons: [
      { id: 'book_appointment', title: '📅 Book Appointment' },
      { id: 'main_menu', title: '🏠 Main Menu' }
    ]
  }),

  bookingFlow: () => ({
    type: 'flow',
    body: `📋 Let's book your appointment!\n\n` +
          `👇 Tap below to get started:`,
    flowData:{salon_name: "glamour_salon"}
  }),

  confirmation: (bookingDetails) => {
    // Find service name from ID
    const serviceMap = {
      'bleach': '✨ Bleach',
      'cleanup': '🧼 Clean up',
      'detan': '☀️ Detan',
      'facial': '🌸 Facial',
      'hair_colouring': '🎨 Hair Colouring',
      'hair_spa': '💆‍♂️ Hair Spa',
      'hair_treatment': '🧴 Hair Treatment',
      'haircut': '✂️ Haircut',
      'head_massage': '💆 Head Massage',
      'manicure': '💅 Manicure',
      'party_makeup': '💄 Party Makeup',
      'pedicure': '🦶 Pedicure'
    };

    return {
      type: 'text',
      body: `✅ BOOKING CONFIRMED! ✅\n\n` +
            `Booking ID: #${bookingDetails.bookingId}\n\n` +
            `📋 Booking Details:\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `👤 Name: ${bookingDetails.customer_name}\n` +
            `📞 Phone: ${bookingDetails.customer_phone}\n` +
            (bookingDetails.customer_email ? `📧 Email: ${bookingDetails.customer_email}\n` : '') +
            `\n📍 Location:\n` +
            `   Pincode: ${bookingDetails.pincode}\n` +
            `   Salon: ${bookingDetails.salon_id}\n` +
            `\n💇 Service Details:\n` +
            `   Gender: ${bookingDetails.gender === 'male' ? '👨 Male' : '👩 Female'}\n` +
            `   Service: ${serviceMap[bookingDetails.service_id] || bookingDetails.service_id}\n` +
            `\n📅 Appointment:\n` +
            `   Date: ${formatDate(bookingDetails.appointment_date)}\n` +
            `   Time: ${formatTime(bookingDetails.appointment_time)}\n` +
            `   Stylist: ${bookingDetails.stylist_id}\n` +
            (bookingDetails.special_notes ? `\n📝 Special Notes: ${bookingDetails.special_notes}\n` : '') +
            `━━━━━━━━━━━━━━━━\n\n` +
            `We'll send you a reminder 24 hours before your appointment.\n\n` +
            `Thank you for choosing ${BOT_CONFIG.salonName}! 💖`,
      image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800'
    };
  },

  thanks: () => ({
    type: 'interactive',
    body: `🙏 Thank you for booking with us!\n\n` +
          `We look forward to pampering you! ✨\n\n` +
          `Need anything else?`,
    buttons: [
      { id: 'book_appointment', title: '📅 Book Another' },
      { id: 'main_menu', title: '🏠 Main Menu' }
    ]
  })
};

// Generate booking ID
function generateBookingId() {
  return 'BK' + Date.now().toString().slice(-8);
}

// Format date from YYYY-MM-DD to DD/MM/YYYY
function formatDate(dateString) {
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
}

// Format time from 24h to 12h format
function formatTime(timeString) {
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour.toString().padStart(2, '0')}:${minutes} ${ampm}`;
}

// Format response for WhatsApp Business API
function formatWhatsAppResponse(message) {
  if (message.type === 'interactive' && message.buttons) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: message.body },
        action: {
          buttons: message.buttons.map(btn => ({
            type: "reply",
            reply: { id: btn.id, title: btn.title }
          }))
        }
      }
    };
  }

  // WhatsApp Flow format
  if (message.type === 'flow') {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      type: "interactive",
      interactive: {
        type: "flow",
        header: {
          type: "text",
          text: "Book Your Appointment"
        },
        body: {
          text: message.body
        },
        footer: {
          text: `Powered by ${BOT_CONFIG.salonName}`
        },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_token: generateFlowToken(),
            flow_id: BOT_CONFIG.flowId,
            flow_cta: "Start Booking",
            flow_action: "navigate",
            flow_action_payload: {
              screen: "LOCATION_SELECTION",
              data: message.flowData
            }
          }
        }
      }
    };
  }

  if (message.type === 'text') {
    const response = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      type: "text",
      text: { body: message.body }
    };

    if (message.image) {
      return [
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          type: "image",
          image: { link: message.image }
        },
        response
      ];
    }

    return response;
  }

  return message;
}

// Generate flow token for security
function generateFlowToken() {
  return 'flow_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Webhook verification (for WhatsApp)
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "salon_bot_token_2024";
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    console.error('Webhook verification failed');
    res.sendStatus(403);
  }
});

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Quick response to WhatsApp
    res.sendStatus(200);

    // Check if it's a WhatsApp message
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (!message) return;

      const userId = message.from;
      const messageType = message.type;
      const session = getOrCreateSession(userId);

      let response;

      // Handle text messages (hi, hello)
      if (messageType === 'text') {
        const text = message.text.body.trim().toLowerCase();
        
        if (text === 'hi' || text === 'hello' || text === 'hey' || text === 'start') {
          response = messageTemplates.welcome();
          session.step = 'welcome';
        } else {
          response = messageTemplates.welcome();
        }
      }

      // Handle interactive button replies
      if (messageType === 'interactive') {
        const interactive = message.interactive;
        const buttonId = interactive.button_reply?.id || interactive.list_reply?.id;
        
        // Handle Flow response (form submission)
        const nfmReply = interactive.nfm_reply;
        
        if (nfmReply) {
          // Flow form submitted
          console.log('Flow response received:', JSON.stringify(nfmReply, null, 2));
          
          const flowData = JSON.parse(nfmReply.response_json);
          
          // Add booking ID to the data
          const bookingDetails = {
            bookingId: generateBookingId(),
            ...flowData
          };

          session.data.bookingDetails = bookingDetails;
          session.step = 'confirmed';

          // Send confirmation
          response = messageTemplates.confirmation(bookingDetails);
          await sendMessage(userId, response);
          
          // Send thank you message after a delay
          setTimeout(async () => {
            const thanksMsg = messageTemplates.thanks();
            await sendMessage(userId, thanksMsg);
          }, 2000);

          return;
        }

        // Handle regular buttons
        if (buttonId === 'view_services') {
          response = messageTemplates.services();
          session.step = 'viewing_services';
        } 
        else if (buttonId === 'book_appointment') {
          response = messageTemplates.bookingFlow();
          session.step = 'booking_flow';
        }
        else if (buttonId === 'main_menu') {
          response = messageTemplates.welcome();
          session.step = 'welcome';
        }
      }

      // Send response
      if (response) {
        await sendMessage(userId, response);
      }
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    
    try {
      if (message?.from) {
        await sendMessage(message.from, {
          type: 'text',
          body: '⚠️ An error occurred. Please type "hi" to start again.'
        });
      }
    } catch (err) {
      console.error('Failed to send error message:', err);
    }
  }
});

// Function to send message using WhatsApp Business API
async function sendMessage(userId, message) {
  const formattedMessage = formatWhatsAppResponse(message);
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
  
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error('Missing WhatsApp API credentials. Please set WHATSAPP_TOKEN and PHONE_NUMBER_ID in .env');
    return;
  }

  const config = {
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    }
  };

  try {
    if (Array.isArray(formattedMessage)) {
      for (const msg of formattedMessage) {
        const payload = { ...msg, to: userId };
        console.log('Sending message to', userId);
        
        const response = await axios.post(
          `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
          payload,
          config
        );
        
        console.log('Message sent successfully:', response.data);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } else {
      const payload = { ...formattedMessage, to: userId };
      console.log('Sending message to', userId);
      
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
        payload,
        config
      );
      
      console.log('Message sent successfully:', response.data);
    }
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

// Test endpoint to simulate messages
app.post('/test/message', async (req, res) => {
  const { userId, message, buttonId, flowResponse } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  let mockWebhookBody;

  if (flowResponse) {
    // Test flow response
    mockWebhookBody = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: userId,
              type: 'interactive',
              interactive: {
                type: 'nfm_reply',
                nfm_reply: {
                  response_json: JSON.stringify(flowResponse),
                  body: 'Form submitted'
                }
              }
            }]
          }
        }]
      }]
    };
  } else if (buttonId) {
    mockWebhookBody = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: userId,
              type: 'interactive',
              interactive: {
                button_reply: { id: buttonId }
              }
            }]
          }
        }]
      }]
    };
  } else {
    mockWebhookBody = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: userId,
              type: 'text',
              text: { body: message }
            }]
          }
        }]
      }]
    };
  }

  try {
    const originalReq = { body: mockWebhookBody };
    const originalRes = { 
      sendStatus: () => ({ status: () => ({ send: () => {} }) })
    };
    
    await app._router.handle(originalReq, originalRes, () => {});
    res.json({ success: true, message: 'Test message processed' });
  } catch (error) {
    console.error('Error processing test:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear session
app.post('/test/clear/:userId', (req, res) => {
  const { userId } = req.params;
  userSessions.delete(userId);
  res.json({ success: true, message: 'Session cleared' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeUsers: userSessions.size,
    whatsappConfigured: !!(process.env.WHATSAPP_TOKEN && process.env.PHONE_NUMBER_ID),
    flowConfigured: !!BOT_CONFIG.flowId && BOT_CONFIG.flowId !== 'YOUR_FLOW_ID'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Simplified Salon Bot Running!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔗 Webhook: /webhook`);
  console.log(`\n✅ Flow: User fills everything in the form`);
  console.log(`✅ Steps: Hi → View Services → Book Appointment → Flow → Confirmation`);
  console.log(`\n✨ Ready to book!\n`);
});