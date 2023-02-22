const { Configuration, OpenAIApi } = require("openai");

const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const port = process.env.PORT || 3000;
const filepath = path.join(__dirname, 'public')
const ejs = require('ejs')
const configuration = new Configuration({
    apiKey: "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"
});

app.set('view engine', 'ejs');
app.use("/public", express.static("public"));
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

const openai = new OpenAIApi(configuration);


//middleware function to send/receive prompt
async function getResponse(req, res, next) {

    let chatResponse = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: req.body.prompt,
        temperature: 0,
        max_tokens: 4050,
        top_p: 1,
        frequency_penalty: 0.2,
        presence_penalty: 0,
    });

    // copies prompt responses to a text file for review
    fs.appendFile("response.txt", chatResponse.data.choices[0].text, function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log("Response saved to response.txt");
        }
    });

    req.APIresponse = chatResponse
    next()
}

app.get('/', (req, res) => {
    res.render("index", { data: null });
});


app.post('/', getResponse, (req, res) => {
    console.log(req.body.prompt)
    res.render("index", { data: req.APIresponse.data.choices[0].text, });
})



app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
