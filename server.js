// server.js - Serverless Event Calendar AI backend
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10mb' }));

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY environment variable is required');
}

// Extract events from image
app.post('/api/extract-events', async (req, res) => {
    try {
        const { fileData, fileName, mimeType } = req.body;
        
        if (!fileData) {
            return res.status(400).json({ error: 'No file data provided' });
        }

        if (!OPENAI_API_KEY) {
            return res.status(500).json({ error: 'OpenAI API key not configured' });
        }

        // fileData is already base64, use it directly
        const base64Image = fileData;

        // Call OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Extract ALL events from this image. For each event found, provide:
- title (event name)
- date (YYYY-MM-DD format, convert relative dates assuming today is ${new Date().toISOString().split('T')[0]})
- time (HH:MM format, use 24-hour time, if no time specified use "09:00")
- location (venue/address, if not specified use "TBD")
- description (brief details)

Return ONLY a JSON array of events, no other text. Example format:
[{"title": "Event Name", "date": "2025-08-15", "time": "19:00", "location": "Venue", "description": "Details"}]

If you find multiple events (like a schedule), extract ALL of them.`
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: base64Image
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 2000,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('OpenAI API Error:', error);
            return res.status(500).json({ 
                error: `OpenAI API Error: ${error.error?.message || 'Unknown error'}` 
            });
        }

        const result = await response.json();
        const content = result.choices[0].message.content.trim();

        try {
            // Clean up the response in case it has markdown formatting
            const jsonString = content.replace(/```json\n?|\n?```/g, '').trim();
            const events = JSON.parse(jsonString);

            if (!Array.isArray(events)) {
                throw new Error('Invalid response format');
            }

            res.json({ events });
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError, 'Content:', content);
            res.status(500).json({ 
                error: 'Could not parse AI response',
                rawResponse: content 
            });
        }

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;