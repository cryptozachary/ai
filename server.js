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
const openai = new OpenAIApi(configuration);

app.set('view engine', 'ejs');
app.use("/public", express.static("public"));
app.use(express.json())
app.use(express.urlencoded({ extended: false }))


//middleware function to send/receive prompt
async function getResponse(req, res, next) {

    try {
        let chatResponse = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: req.body.prompt ?? "Hello Alex!",
            temperature: 0,
            max_tokens: 4050,
            top_p: 1,
            frequency_penalty: 0.2,
            presence_penalty: 0,
        });

        if (chatResponse) {
            saveResponseToFile(chatResponse.data.choices[0].text);
        }

        req.APIresponse = chatResponse
        next()
    } catch (error) {
        console.log(error)
        next(error)
    }
}
//save response to text file
function saveResponseToFile(responseData) {
    fs.appendFile("response.txt", responseData, function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log("Response saved to response.txt");
        }
    });
}


app.get('/', getResponse, (req, res) => {

    res.render("index", { data: req.APIresponse.data.choices[0].text, });
});


app.post('/', getResponse, (req, res) => {
    console.log(req.body.prompt)
    res.render("index", { data: req.APIresponse.data.choices[0].text, });
})


app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
