const mongoose = require('mongoose')

const responseScheme = new mongoose.Schema({
    response: {
        type: String,
        required: true
    }
})

const Response = mongoose.model('Response', responseScheme)

module.exports = Response;
