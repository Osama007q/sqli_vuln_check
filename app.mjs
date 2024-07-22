import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 8081;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configure Express settings
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Start the server
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});

// Route to render the index page
app.get('/', (req, res) => {
    res.render('index');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error occurred:', err);
    console.error(`Error message: ${err.message}`);
    console.error(`Error stack: ${err.stack}`);

    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        stack: err.stack
    });
});

// Route to handle POST request for vulnerability analysis
app.post('/analyse', async (req, res, next) => {
    console.log('Received request to /analyse');
    const code = req.body.code;
    console.log(`Code: ${code}`);

    try {
        const result = await checkForVulnerabilities(code);
        console.log(result);
        res.render('results', { result: result });
    } catch (error) {
        console.error('Error in /analyse route:', error.message);
        if (error.message.includes('You exceeded your current quota')) {
            res.status(429).json({ error: 'Quota exceeded. Please check your plan and billing details.' });
        } else {
            next(error); // Pass the error to the error handling middleware
        }
    }
});

async function checkForVulnerabilities(code) {
    let retries = 0;
    const maxRetries = 5;
    const retryDelay = 1000; // 1 second

    while (retries < maxRetries) {
        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'You are a code vulnerability analysis assistant.' },
                    { role: 'user', content: `Analyze the following code for vulnerabilities: ${code}` }
                ],
                max_tokens: 1500,
            });
            return response.choices[0].message.content; // Extract content from the message object
        } catch (error) {
            if (error.response) {
                console.error('OpenAI API Error:', error.response.status, error.response.data);
                if (error.response.status === 429) {
                    console.log(`Rate limit exceeded. Retrying in ${retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    retries++;
                } else {
                    throw new Error(`OpenAI API Error: ${error.response.status} - ${error.response.data.error.message}`);
                }
            } else if (error.request) {
                console.error('No response received from OpenAI API:', error.request);
                throw new Error('No response received from OpenAI API');
            } else {
                console.error('Error setting up OpenAI API request:', error.message);
                throw new Error('Error setting up OpenAI API request');
            }
        }
    }

    console.error(`Failed to make request after ${maxRetries} retries.`);
    throw new Error(`Failed to make request after ${maxRetries} retries.`);
}

// Default route for handling 404 errors
app.use('*', (req, res) => {
    res.status(404).send('404 Page Not Found!');
});
