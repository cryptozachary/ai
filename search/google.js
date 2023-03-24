
const { google } = require("googleapis");
const customsearch = google.customsearch('v1')

async function search(query) {
    const res = await customsearch.cse.list({
        cx: process.env.SEARCH_ENGINE_ID,
        q: query,
        auth: process.env.GOOGLE_API_KEY,
    });

    if (res.status !== 200) {
        throw new Error("Failed to search");
    }

    const items = res.data.items.map((item) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
    }));
    console.log(items)
    return items;
}

module.exports = { search };
