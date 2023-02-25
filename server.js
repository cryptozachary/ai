const { Configuration, OpenAIApi } = require("openai");
const express = require('express');
require('dotenv').config()
const app = express();
const path = require('path');
const fs = require('fs');
const port = process.env.PORT || 3000;
const filepath = path.join(__dirname, 'public')
const ejs = require('ejs')
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


//middleware function to send/receive prompt
async function getResponse(req, res, next) {

    // read the contents of the "response.txt" file
    let previousResponses = fs.readFileSync("response.txt", "utf-8");


    console.log(previousResponses.length)
    if (previousResponses.length >= 4000) {
        console.log('Responses need to be summarized')
        // Clear the response.txt file if the number of words is close to 5000 characters
        //fs.writeFileSync("response.txt", "");
        //previousResponses = "";
        await summarize(previousResponses)
    }

    // Amaru identity , previous responses and current prompt sent to model
    let thePrompt = identity[0] + " " + previousResponses + " " + req.body.prompt;

    //console.log(thePrompt);

    try {
        let chatResponse = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: thePrompt || identity[0],
            temperature: 0.4,
            max_tokens: 3050,
            top_p: 1,
            frequency_penalty: 0.2,
            presence_penalty: 0,
        });

        if (chatResponse) {
            //console.log(chatResponse.data.choices, chatResponse)
            saveResponseToFile(chatResponse.data.choices[0].text);
        }

        // attach response to request object
        req.APIresponse = chatResponse

        next()
    } catch (error) {
        console.log(error)
        next(error)
    }
}
//save response to text file
function saveResponseToFile(responseData) {

    // read the contents of the "response.txt" file
    //let previousResponses = fs.readFileSync("response.txt", "utf-8");

    // let newResponse = previousResponses.trim().length > 0 ? previousResponses + " " + responseData : responseData;

    let cleanResponse = responseData.replace(/\n/g, '')

    fs.appendFile("response.txt", `${cleanResponse}, `, function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log("Response saved to response.txt");
        }
    });
}

//summarize response file data with curie
async function summarize(savedResponses) {

    try {
        let chatResponse = await openai.createCompletion({
            model: "text-curie-001",
            prompt: "What are the main topics of this passage" + savedResponses,
            temperature: 0.9,
            max_tokens: 1050,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
            best_of: 1,
        });

        if (chatResponse) {
            console.log("Curied said" + chatResponse.data.choices[0].text)
            fs.writeFileSync("response.txt", "");
            saveResponseToFile(chatResponse.data.choices[0].text);
        }

        //req.APIresponse = chatResponse

    } catch (error) {
        console.log('error caught!')
    }
}



//routes
app.get('/', getResponse, (req, res) => {

    // renderds
    res.render("index", { data: req.APIresponse.data.choices[0].text, });
});


app.post('/', getResponse, (req, res) => {
    res.render("index", { data: req.APIresponse.data.choices[0].text, });
})


app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
