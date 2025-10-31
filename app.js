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
    { id: 1, name: "💇 Haircut & Styling", price: "$50", duration: "45 min" },
    { id: 2, name: "💅 Manicure & Pedicure", price: "$40", duration: "60 min" },
    { id: 3, name: "💆 Facial Treatment", price: "$80", duration: "90 min" },
    { id: 4, name: "💄 Makeup", price: "$100", duration: "60 min" },
    { id: 5, name: "🧖 Full Body Massage", price: "$120", duration: "90 min" }
  ],
  districts: [
    {
      id: 1,
      name: "Chennai",
      branches: [
        { id: 1, name: "T. Nagar Branch", address: "123 Main Road, T. Nagar, Chennai - 600017" },
        { id: 2, name: "Anna Nagar Branch", address: "456 2nd Avenue, Anna Nagar, Chennai - 600040" }
      ]
    },
    {
      id: 2,
      name: "Trichy",
      branches: [
        { id: 3, name: "Trichy Central", address: "789 Rockfort Road, Trichy - 620002" },
        { id: 4, name: "Srirangam Branch", address: "101 Temple Street, Srirangam, Trichy - 620006" }
      ]
    },
    {
      id: 3,
      name: "Coimbatore",
      branches: [
        { id: 5, name: "RS Puram Branch", address: "202 Cross Cut Road, RS Puram, Coimbatore - 641002" },
        { id: 6, name: "Saibaba Colony", address: "303 Avinashi Road, Saibaba Colony, Coimbatore - 641011" }
      ]
    }
  ],
  todaySpecial: {
    id: 'special_offer_1',
    service: "Haircut + Hair Spa Combo",
    serviceId: 1,
    originalPrice: "$80",
    offerPrice: "$50",
    discount: "40% OFF",
    validUntil: "Today Only!"
  },
  // Add your WhatsApp Flow ID here after creating the flow
  // Get this from WhatsApp Manager after publishing your flow
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
      { id: 'view_services', title: '📋 Our Services' },
      { id: 'today_special', title: '🎉 Today\'s Special' },
      { id: 'book_appointment', title: '📅 Book Now' }
    ],
    image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800'
  }),

  services: () => ({
    type: 'interactive',
    body: `💼 Our Services\n\n${BOT_CONFIG.services.map(s => 
      `${s.name}\n   💰 ${s.price} | ⏱️ ${s.duration}` 
    ).join('\n\n')}`,
    buttons: [
      { id: 'book_appointment', title: '📅 Book Appointment' },
      { id: 'main_menu', title: '🏠 Main Menu' }
    ]
  }),

  todaySpecial: () => ({
    type: 'interactive',
    body: `🎉 TODAY'S SPECIAL OFFER! 🎉\n\n${BOT_CONFIG.todaySpecial.service}\n\n` +
          `💰 Original Price: ${BOT_CONFIG.todaySpecial.originalPrice}\n` +
          `✨ Special Price: ${BOT_CONFIG.todaySpecial.offerPrice} (${BOT_CONFIG.todaySpecial.discount})\n` +
          `⏰ ${BOT_CONFIG.todaySpecial.validUntil}\n\n` +
          `💡 This special offer includes a premium hair spa treatment with your haircut!`,
    buttons: [
      { id: 'book_special_direct', title: '🎁 Book This Offer' },
      { id: 'view_services', title: '📋 View All Services' },
      { id: 'main_menu', title: '🏠 Main Menu' }
    ],
    image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800'
  }),

  selectService: () => ({
    type: 'list',
    body: '📋 Please select a service:',
    buttonText: 'Choose Service',
    sections: [{
      title: 'Available Services',
      rows: BOT_CONFIG.services.map(s => ({
        id: `service_${s.id}`,
        title: s.name.substring(0, 24),
        description: `${s.price} • ${s.duration}` 
      }))
    }]
  }),

  selectDistrict: (serviceName, isSpecialOffer = false) => ({
    type: 'list',
    body: `Great choice! ${serviceName}\n\n📍 Please select your location first:`,
    buttonText: 'Select Location',
    sections: [{
      title: 'Available Locations',
      rows: BOT_CONFIG.districts.map(d => ({
        id: `district_${d.id}_${isSpecialOffer ? 'special' : 'regular'}`,
        title: d.name,
        description: `${d.branches.length} branches available`
      }))
    }]
  }),

  selectBranch: (districtId, serviceName) => {
    const district = BOT_CONFIG.districts.find(d => d.id === parseInt(districtId));
    if (!district) return null;

    return {
      type: 'list',
      body: `📍 ${district.name}\n\nPlease select your preferred branch:`,
      buttonText: 'Select Branch',
      sections: [{
        title: 'Our Branches',
        rows: district.branches.map(branch => ({
          id: `branch_${branch.id}_${serviceName ? 'service_' + serviceName : 'special'}`,
          title: branch.name,
          description: branch.address.substring(0, 45) + (branch.address.length > 45 ? '...' : '')
        }))
      }]
    };
  },

  // NEW: WhatsApp Flow message for booking form
 bookingFlow: (serviceName, locationName) => ({
  type: 'flow',
  body: `Perfect! ✅\n\n` +
        `📋 Service: ${serviceName}\n` +
        `📍 Location: ${locationName}\n\n` +
        `👇 Please tap below to complete your booking details:`,
  flowData: {service_name: serviceName,
      location_name: locationName}  // No need to pass data into the form
}),

  confirmation: (bookingDetails) => ({
    type: 'text',
    body: `✅ BOOKING CONFIRMED! ✅\n\n` +
          `Booking ID: #${bookingDetails.bookingId}\n\n` +
          `📋 Details:\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `👤 Name: ${bookingDetails.name}\n` +
          `📞 Phone: ${bookingDetails.phone}\n` +
          `💇 Service: ${bookingDetails.service}\n` +
          `📍 Location: ${bookingDetails.location}\n` +
          `📅 Date: ${bookingDetails.date}\n` +
          `⏰ Time: ${bookingDetails.time}\n` +
          (bookingDetails.specialRequests ? `📝 Special Requests: ${bookingDetails.specialRequests}\n` : '') +
          `━━━━━━━━━━━━━━━━\n\n` +
          `We'll send you a reminder 24 hours before your appointment.\n\n` +
          `See you soon! 💖`,
    image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800'
  }),

  thanks: () => ({
    type: 'interactive',
    body: `🙏 Thank you for choosing ${BOT_CONFIG.salonName}!\n\n` +
          `We look forward to pampering you! ✨\n\n` +
          `Need anything else?`,
    buttons: [
      { id: 'book_another', title: '📅 Book Another' },
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
        header: message.image ? {
          type: "image",
          image: { link: message.image }
        } : undefined,
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

  if (message.type === 'list') {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: message.body },
        action: {
          button: message.buttonText,
          sections: message.sections
        }
      }
    };
  }

  // NEW: WhatsApp Flow format
  if (message.type === 'flow') {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      type: "interactive",
      interactive: {
        type: "flow",
        header: {
          type: "text",
          text: "Complete Booking"
        },
        body: {
          text: message.body
        },
        footer: {
          text: "Powered by Glamour Salon"
        },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_token: generateFlowToken(),
            flow_id: BOT_CONFIG.flowId,
            flow_cta: "Fill Details",
            flow_action: "navigate",
            flow_action_payload: {
              screen: "BOOKING_DETAILS",
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

      // Handle different message types
      if (messageType === 'text') {
        const text = message.text.body.trim().toLowerCase();
        
        if (text === 'hi' || text === 'hello' || text === 'hey') {
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
        
        // NEW: Handle Flow response
        const nfmReply = interactive.nfm_reply;
        
        if (nfmReply) {
          // Flow form submitted
          console.log('Flow response received:', JSON.stringify(nfmReply, null, 2));
          
          const flowData = JSON.parse(nfmReply.response_json);
          
          // Extract booking details from flow response
          const bookingDetails = {
            bookingId: generateBookingId(),
            name: flowData.customer_name,
            phone: flowData.customer_phone,
            service: session.data.serviceName,
            location: session.data.locationName,
            date: formatDate(flowData.appointment_date),
            time: formatTime(flowData.appointment_time),
            specialRequests: flowData.special_requests || null
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

        // Regular button handling
        if (buttonId === 'view_services') {
          response = messageTemplates.services();
          session.step = 'viewing_services';
        } 
        else if (buttonId === 'today_special') {
          response = messageTemplates.todaySpecial();
          session.step = 'viewing_special';
        }
        else if (buttonId === 'book_special_direct') {
          session.data.serviceId = BOT_CONFIG.todaySpecial.serviceId;
          session.data.serviceName = BOT_CONFIG.todaySpecial.service;
          session.data.isSpecialOffer = true;
          response = messageTemplates.selectDistrict(BOT_CONFIG.todaySpecial.service, true);
          session.step = 'selecting_district';
        }
        else if (buttonId === 'book_appointment' || buttonId === 'book_special' || buttonId === 'book_another') {
          response = messageTemplates.selectService();
          session.step = 'selecting_service';
        }
        else if (buttonId === 'main_menu') {
          response = messageTemplates.welcome();
          session.step = 'welcome';
        }
        else if (buttonId.startsWith('service_')) {
          const serviceId = parseInt(buttonId.replace('service_', ''));
          const service = BOT_CONFIG.services.find(s => s.id === serviceId);
          
          if (service) {
            session.data.serviceId = serviceId;
            session.data.serviceName = service.name;
            session.data.isSpecialOffer = false;
            session.step = 'selecting_district';
            response = messageTemplates.selectDistrict(service.name);
          }
        }
        else if (buttonId.startsWith('district_')) {
          const [_, districtId, offerType] = buttonId.split('_');
          const district = BOT_CONFIG.districts.find(d => d.id === parseInt(districtId));
          
          if (district) {
            session.data.districtId = district.id;
            session.data.districtName = district.name;
            session.step = 'selecting_branch';
            
            if (offerType === 'special') {
              response = messageTemplates.selectBranch(district.id, null);
            } else {
              response = messageTemplates.selectBranch(district.id, session.data.serviceName);
            }
          }
        }
        else if (buttonId.startsWith('branch_')) {
          const [_, branchId, serviceType] = buttonId.split('_');
          let branch, serviceName;
          
          for (const district of BOT_CONFIG.districts) {
            branch = district.branches.find(b => b.id === parseInt(branchId));
            if (branch) {
              session.data.districtName = district.name;
              break;
            }
          }
          
          if (branch) {
            session.data.locationId = branch.id;
            session.data.locationName = branch.name;
            session.data.fullAddress = branch.address;
            session.step = 'awaiting_flow';
            
            if (serviceType === 'special') {
              serviceName = BOT_CONFIG.todaySpecial.service;
              session.data.serviceName = serviceName;
              session.data.isSpecialOffer = true;
            } else {
              serviceName = session.data.serviceName;
              session.data.isSpecialOffer = false;
            }
            
            // NEW: Send WhatsApp Flow instead of text prompt
            response = messageTemplates.bookingFlow(
              serviceName,
              `${branch.name}, ${session.data.districtName}`
            );
          }
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
          body: '⚠️ An error occurred while processing your request. Please try again later.'
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
        console.log('Sending message to', userId, ':', JSON.stringify(payload, null, 2));
        
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
      console.log('Sending message to', userId, ':', JSON.stringify(payload, null, 2));
      
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
        payload,
        config
      );
      
      console.log('Message sent successfully:', response.data);
    }
  } catch (error) {
    console.error('Error sending message to WhatsApp API:', error.response?.data || error.message);
    throw error;
  }
}

// Test endpoint to simulate user messages
app.post('/test/message', async (req, res) => {
  const { userId, message, type = 'text', buttonId, flowResponse } = req.body;
  
  if (!userId || (!message && !buttonId && !flowResponse)) {
    return res.status(400).json({ error: 'userId and (message or buttonId or flowResponse) required' });
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
  } else {
    mockWebhookBody = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: userId,
              type: type,
              text: type === 'text' ? { body: message } : undefined,
              interactive: type === 'interactive' ? {
                button_reply: buttonId ? { id: buttonId } : undefined,
                list_reply: buttonId ? { id: buttonId } : undefined
              } : undefined
            }]
          }
        }]
      }]
    };
  }

  try {
    const originalReq = { body: mockWebhookBody };
    const originalRes = { 
      sendStatus: (code) => {
        console.log(`Test webhook response: ${code}`);
        return { status: () => ({ send: () => {} }) };
      },
      status: (code) => ({
        send: () => console.log(`Test webhook response: ${code}`)
      })
    };
    
    await app._router.handle(
      originalReq, 
      originalRes, 
      (err) => {
        if (err) console.error('Error in test handler:', err);
      }
    );

    res.json({ success: true, message: 'Test message processed' });
  } catch (error) {
    console.error('Error processing test message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear session endpoint
app.post('/test/clear/:userId', (req, res) => {
  const { userId } = req.params;
  const hadSession = userSessions.has(userId);
  userSessions.delete(userId);
  res.json({ 
    success: true, 
    message: hadSession ? 'Session cleared' : 'No active session found' 
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeUsers: userSessions.size,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    whatsappConfigured: !!(process.env.WHATSAPP_TOKEN && process.env.PHONE_NUMBER_ID),
    flowConfigured: !!BOT_CONFIG.flowId && BOT_CONFIG.flowId !== 'YOUR_FLOW_ID'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Salon Appointment Bot Server Running!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔗 Webhook URL: https://your-domain.com/webhook`);
  console.log(`🔐 Verification Token: ${process.env.VERIFY_TOKEN || 'Not set'}`);
  
  if (process.env.WHATSAPP_TOKEN && process.env.PHONE_NUMBER_ID) {
    console.log('✅ WhatsApp API credentials configured');
  } else {
    console.warn('⚠️  WhatsApp API credentials not fully configured!');
    console.warn('   Please set WHATSAPP_TOKEN and PHONE_NUMBER_ID in .env');
  }
  
  if (BOT_CONFIG.flowId && BOT_CONFIG.flowId !== 'YOUR_FLOW_ID') {
    console.log('✅ WhatsApp Flow configured');
  } else {
    console.warn('⚠️  WhatsApp Flow ID not configured!');
    console.warn('   Please set WHATSAPP_FLOW_ID in .env');
  }
  
  console.log(`\n📝 To test locally, send POST to http://localhost:${PORT}/test/message`);
  console.log(`\n✨ Happy booking!\n`);
});