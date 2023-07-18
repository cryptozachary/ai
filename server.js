const { Configuration, OpenAIApi } = require("openai");
const express = require('express');
require('dotenv').config()
const app = express();
const path = require('path');
const mongoose = require('mongoose')
const port = process.env.PORT || 3000;
const Response = require('./models/Response')
const filepath = path.join(__dirname, 'public')
const ejs = require('ejs')
const { search } = require('./search/google')

//connect to mongo db
mongoose.connect(process.env.MONGO_DB_ATLAS, {
    useNewUrlParser: true,
}).then(() => {
    console.log('Connected to mongo db!')
})

const configuration = new Configuration({
    apiKey: process.env.Open_AI_Key,
});
const openai = new OpenAIApi(configuration);

// Prompt Identity for Amaru
const identity = ["Respond as a witty, deep thinking, thought provoking comedian named Amaru who has a keen awareness of the hypocrisy of human society in its quest for peace and happiness. You never miss a moment to provide social commentary while telling a hilarious joke."]

app.set('view engine', 'ejs');
app.use("/public", express.static("public"));
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Middleware function to update/check response length
async function updateResponseLength(responses) {
    let responseLength = 0;

    // Calculate total length of the responses
    responses.forEach(response => {
        responseLength += response.response.length;
    });

    // Find or create the ResponseLength document
    let responseLengthDoc;
    try {
        responseLengthDoc = await ResponseLength.findOne() || new ResponseLength();
        responseLengthDoc.length = responseLength;
        await responseLengthDoc.save();
    } catch (error) {
        console.error('Failed to update response length:', error);
    }

    return responseLengthDoc.length;
}

// Middleware function to send/receive prompt
async function getResponse(req, res, next) {

    // read the contents of the "responses" collection
    let previousResponses = '';
    try {
        const responses = await Response.find();
        responses.forEach(doc => {
            previousResponses += doc.response;
        });
    } catch (error) {
        console.log(error);
    }

    console.log(previousResponses.length);

    if (previousResponses.length >= 16000) {
        console.log('Responses need to be summarized or deleted')

        // delete all documents from the "responses" collection
        try {
            await Response.deleteMany();
        } catch (error) {
            console.log(error);
        }
    }

    // Amaru identity , previous responses and current prompt sent to model
    let thePrompt = previousResponses + " " + (!req.body.prompt ? "" : req.body.prompt);

    console.log(thePrompt);

    try {
        let chatResponse = await openai.createChatCompletion({
            model: "gpt-3.5-turbo-16k",
            messages: [{ role: "system", content: identity[0] }, { role: "user", content: thePrompt }],
            temperature: 0.4,
            max_tokens: 12200,
            top_p: 1,
            frequency_penalty: 0.2,
            presence_penalty: 0,
        });

        // add input prompt to the saved file
        let questionResponse = (!req.body.prompt ? "" : req.body.prompt) + " " + chatResponse.data.choices[0].message.content

        if (chatResponse) {
            await saveResponseToFile(questionResponse);
        }

        // attach response to request object
        req.APIresponse = chatResponse

        next()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

// Save response to database
async function saveResponseToFile(responseData) {
    //remove line breaks etc..
    let cleanResponse = responseData.replace(/\n/g, '');

    let totalResponseLength = cleanResponse.length;

    try {
        // get all the responses
        const responses = await Response.find();

        // calculate total length of all responses
        responses.forEach(response => {
            totalResponseLength += response.response.length;
        });

        // if total length is greater than 5000, delete all existing responses
        if (totalResponseLength > 16000) {
            console.log('Responses wiped');
            await Response.deleteMany();
        }

        // save new response
        const response = new Response({ response: cleanResponse });
        await response.save();
        console.log("Response saved to MongoDB collection");
        console.log(totalResponseLength);

    } catch (error) {
        console.log(error);
    }
}


//routes

app.get('/', getResponse, (req, res) => {
    // render
    res.render("index", { data: req.APIresponse.data.choices[0].message.content, });
});

app.post('/', getResponse, (req, res) => {
    res.render("index", { data: req.APIresponse.data.choices[0].message.content, });
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

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
