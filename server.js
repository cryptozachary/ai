// Module Imports
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { Configuration, OpenAIApi } = require("openai");
const { search } = require('./search/google');
const Response = require('./models/Response');

// Load environment variables
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
// Prompt Identity for Amaru
const identity = ["Respond as a witty, deep thinking, thought provoking comedian named Amaru who has a keen awareness of the hypocrisy of human society in its quest for peace and happiness. You never miss a moment to provide social commentary while telling a hilarious joke."]

// Setup view engine and middleware
app.set('view engine', 'ejs');
app.use("/public", express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize the OpenAI API client
const openai = new OpenAIApi(new Configuration({
    apiKey: process.env.Open_AI_Key,
}));

// Function to connect to the MongoDB database
async function connectToDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_DB_ATLAS, {
            useNewUrlParser: true,
        });
        console.log('Connected to mongo db!');
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
    }
}

// Utility function to fetch all previous responses from the database
async function fetchPreviousResponses() {
    return (await Response.find()).map(doc => doc.response).join('');
}

// Utility function to calculate the total length of all stored responses
async function calculateTotalResponseLength() {
    const responses = await Response.find();
    return responses.reduce((acc, response) => acc + response.response.length, 0);
}

// Function to Trim responses
async function trimOldResponses(targetLength) {
    // Get all responses sorted from oldest to newest
    const responses = await Response.find().sort({ createdAt: 1 });
    let totalLength = 0;

    for (let response of responses) {
        totalLength += response.response.length;
        if (totalLength > targetLength) {
            // Delete this particular response
            await Response.findByIdAndDelete(response._id);
            totalLength -= response.response.length;
        } else {
            break;
        }
    }
}

// Middleware to process and retrieve a response from OpenAI
async function getResponse(req, res, next) {
    try {
        let previousResponses = await fetchPreviousResponses();

        // If total previous response length exceeds a limit, trim oldest responses
        if (previousResponses.length >= 16000) {
            console.log('Trimming old responses...');
            await trimOldResponses(15000); // trim down to 15000 to allow space for new responses
            previousResponses = await fetchPreviousResponses();
        }

        // Construct the prompt for the model
        const thePrompt = previousResponses + (req.body.prompt || '');

        // Get the response from OpenAI model
        const chatResponse = await openai.createChatCompletion({
            model: "gpt-3.5-turbo-16k",
            messages: [{ role: "system", content: identity[0] }, { role: "user", content: thePrompt }],
            temperature: 0.4,
            max_tokens: 12200,
            top_p: 1,
            frequency_penalty: 0.2,
            presence_penalty: 0,
        });

        // Construct the response string and save it
        const questionResponse = (req.body.prompt || '') + " " + chatResponse.data.choices[0].message.content;

        await saveResponseToDB(questionResponse);

        // Attach the chat response to the request for further processing
        req.APIresponse = chatResponse;
        next();

    } catch (error) {
        console.error(error);
        next(error);
    }
}

// Function to save a given response to the database
async function saveResponseToDB(responseData) {
    try {
        // Remove line breaks from the response
        const cleanResponse = responseData.replace(/\n/g, '');

        // Check the total length of responses, and trim  if it exceeds a limit
        if ((cleanResponse.length + await calculateTotalResponseLength()) > 16000) {
            console.log('Trimming old responses before saving new one...');
            await trimOldResponses(16000 - cleanResponse.length);
        }

        // Save the current response to the database
        const response = new Response({ response: cleanResponse });
        await response.save();
        console.log("Response saved to MongoDB collection");

    } catch (error) {
        console.error(error);
    }
}

// Define the API routes
app.get('/', getResponse, (req, res) => {
    res.render("index", { data: req.APIresponse.data.choices[0].message.content });
});

app.post('/', getResponse, (req, res) => {
    res.render("index", { data: req.APIresponse.data.choices[0].message.content });
});

app.get("/search", async (req, res) => {
    const { q } = req.query;
    try {
        const results = await search(q);
        res.render("response", { results });
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to search");
    }
});

app.get('/searchbar', (req, res) => {
    res.render("search");
});

// Connect to the database and start the server
connectToDatabase();
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
