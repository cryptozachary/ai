// Module Imports
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { Configuration, OpenAIApi } = require("openai");
const { search } = require('./search/google');
const Response = require('./models/Response');
const fs = require('fs')
const multer = require('multer')

// multer variabl;es
const storage = multer.memoryStorage(); // This will store the file in memory. You can also save it to disk or other places.
const upload = multer({
    storage: storage,

});

// Load environment variables
require('dotenv').config();

// create express app and port
const app = express();
const port = process.env.PORT || 3000;

// Prompt Identity for Amaru
const identity = ["Respond as a witty, deep thinking, thought provoking comedian named Amaru who has a keen awareness of the hypocrisy of human society in its quest for peace and happiness. You never miss a moment to provide social commentary while telling a hilarious joke."]

//string character max and buffer amounts
const MAX_LENGTH = 15000;
const BUFFER = 3000;

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

async function analyzeFile(req, res) {

    // Check if a file was uploaded
    if (!req.file) {
        return res.status(400).send("No file uploaded");
    }

    if (req.file.mimetype !== 'text/plain') {
        return res.render('index', { data: "I'm only able to analyze txt files at the moment. Please try again, and upload a text file." })
    }

    // Extract file contents
    const fileContents = req.file.buffer.toString('utf-8');

    // You can use the fileContents now.
    // For demonstration, let's pass the fileContents as a part of the prompt to OpenAI.
    const prompt = `Describe the contents of the file named ${req.file.originalname}: ${fileContents}`;

    try {
        // Send the prompt to OpenAI and get a response
        const chatResponse = await openai.createChatCompletion({
            model: "gpt-3.5-turbo-16k",
            messages: [{ role: "system", content: identity[0] }, { role: "user", content: prompt }],
            temperature: 0.4,
            max_tokens: 12200,
            top_p: 1,
            frequency_penalty: 0.2,
            presence_penalty: 0,

        });
        // Save the chatResponse to MongoDB (or any temporary storage you prefer)
        const response = new Response({ response: chatResponse.data.choices[0].message.content });
        await response.save();

        // Redirect to home route with an identifier to fetch this response
        res.redirect(`/?responseId=${response._id}`);

    } catch (error) {
        console.error(error);
        res.status(500).send("Error processing the file and getting a response from OpenAI");
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
        console.log(previousResponses.length)

        // If total previous response length exceeds a limit, trim oldest responses
        if (previousResponses.length >= MAX_LENGTH) {
            console.log('Trimming old responses...');
            await trimOldResponses(MAX_LENGTH - BUFFER); // trim down to 14000 to allow space for new responses
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

async function showFiles(req, res, next) {

    try {
        const response = await openai.listFiles();
        console.log(response.data.object.list)
        next()
    }
    catch (error) {
        console.error(error)
        next(console.error());
    }

}

// Function to save a given response to the database
async function saveResponseToDB(responseData) {
    try {
        // Remove line breaks from the response
        const cleanResponse = responseData.replace(/\n/g, '');
        console.log(cleanResponse.length)

        // Check for existing entry in the database that matches the response data
        const existingEntry = await Response.findOne({ response: cleanResponse });

        // If an exact match is found, don't save and return
        if (existingEntry) {
            console.log('Duplicate entry found. Not saving to the database.');
            return;
        }

        // Check the total length of responses, and trim  if it exceeds a limit
        if ((cleanResponse.length + await calculateTotalResponseLength()) > MAX_LENGTH) {
            console.log('Trimming old responses before saving new one...');
            await trimOldResponses(MAX_LENGTH - cleanResponse.length);
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
app.get('/', getResponse, showFiles, async (req, res) => {
    let responseData = req.APIresponse.data.choices[0].message.content;

    // If there's a responseId in the query parameters
    if (req.query.responseId) {
        // Fetch the specific response from MongoDB
        const specificResponse = await Response.findById(req.query.responseId);
        if (specificResponse) {
            responseData = specificResponse.response;
        }
    }

    res.render("index", { data: responseData });
});

app.post('/', getResponse, showFiles, (req, res) => {
    res.render("index", { data: req.APIresponse.data.choices[0].message.content });
});

app.post('/upload', getResponse, showFiles, upload.single('selectedFile'), async (req, res, next) => {
    console.log('File uploaded:', req.file); // This logs the uploaded file's details
    try {
        await analyzeFile(req, res);
    } catch (error) {
        console.error("Error in analyzing file:", error);
        // You can handle the error here, perhaps sending a 500 response or a custom error message.
        res.status(500).send("Error analyzing the uploaded file");
    }
});

// google search route
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

// app.use((err, req, res, next) => {
//     if (err.message === 'Only .txt files are allowed!') {
//         return res.status(400).send(err.message);
//     }
//     // Handle other errors here or pass them to the default Express error handler
//     next(err);
// });

// Connect to the database and start the server
connectToDatabase();
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
