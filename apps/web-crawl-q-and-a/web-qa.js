const { get_encoding } = require("@dqbd/tiktoken");

// Load the tokenizer which is designed to work with the embedding model
const enc = get_encoding('cl100k_base');

// read processed/scraped.csv
const fs = require('fs');
const csv = require('csv-parser');
const fetch = require('node-fetch');
const { Configuration, OpenAIApi } = require("openai");
const readline = require('readline-sync');

const fn = async () => {
    let data = await new Promise((resolve, reject) => {
        const data = [];
        fs.createReadStream('processed/scraped.csv')
            .pipe(csv())
            .on('data', (row) => {
                data.push(row);
            })
            .on('end', () => resolve(data));
    });

    // Tokenize the text and save the number of tokens to a new column
    data = data.map(row => ({ ...row, n_tokens: enc.encode(row.text).length }));

    // Visualize the distribution of the number of tokens per row using a terminal table
    // only show top 10 longest texts
    console.table(data
        .sort((a, b) => b.n_tokens - a.n_tokens)
        .slice(0, 10)
        .map(row => ({ ...row, text: row.text.slice(0, 20) + '...' })));

    const max_tokens = 500;
    const splitIntoMany = (text, max_tokens) => {
        const sentences = text.split('. ');
        const n_tokens = sentences.map(sentence => enc.encode(' ' + sentence).length);
        let chunks = [];
        let tokens_so_far = 0;
        let chunk = [];
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            const token = n_tokens[i];
            if (tokens_so_far + token > max_tokens) {
                chunks.push(chunk.join('. ') + '.');
                chunk = [];
                tokens_so_far = 0;
            }
            if (token > max_tokens) {
                continue;
            }
            chunk.push(sentence);
            tokens_so_far += token + 1;
        }
        return chunks;
    };

    let shortened = [];
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (row.text === null) {
            continue;
        }
        if (row.n_tokens > max_tokens) {
            shortened = shortened.concat(splitIntoMany(row.text, max_tokens));
        } else {
            shortened.push(row.text);
        }
    }
    // only show top 10 longest texts with length
    console.table(shortened
        .sort((a, b) => b.length - a.length)
        .slice(0, 10)
        .map(text => ({ text: text.slice(0, 20) + '...', n_tokens: enc.encode(text).length })));

    // Embed the text using Embedbase
    const vaultId = "dev";
    const url = "https://embedbase-hosted-usx5gpslaq-uc.a.run.app";
    const apiKey = process.env.EMBEDBASE_API_KEY;
    const embed = async (texts) => {
        const r = await fetch(url + "/v1/" + vaultId, {
            method: 'POST',
            headers: {
                "Authorization": "Bearer " + apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                // documents is like [{"data": "hello world"}, {"data": "hello world"}]
                "documents": texts,
            })
        });
        const jsonR = await r.json();
        return jsonR;
    };

    // create batches of text from the dataframe
    const batches = [];
    for (let i = 0; i < shortened.length; i += 100) {
        batches.push(shortened.slice(i, i + 100).map(text => ({ data: text })));
    }

    console.log("Embedding", shortened.length, "texts in", batches.length, "batches...");

    // run batches in parallel
    await Promise.all(batches.map(batch => embed(batch)));

    console.log("Done embedding texts in Embedbase!");

    // now build the generative search engine
    const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);

    const search = async (query, vaultId) => {
        const r = await fetch(url + "/v1/" + vaultId + "/search", {
            method: 'POST',
            headers: {
                "Authorization": "Bearer " + apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "query": query
            })
        });
        return await r.json();
    };

    const createContext = async (question, maxLen = 1800) => {
        const searchResponse = await search(question, vaultId);
        let curLen = 0;
        const returns = [];
        for (const similarity of searchResponse["similarities"]) {
            const sentence = similarity["data"];
            const nTokens = enc.encode(sentence).length;
            curLen += nTokens + 4;
            if (curLen > maxLen) {
                break;
            }
            returns.push(sentence);
        }
        return returns.join("\n\n###\n\n");
    }

    const answerQuestion = async (
        question = "Am I allowed to publish model outputs to Twitter, without a human review?",
        maxLen = 1800,
        maxTokens = 150) => {
        const context = await createContext(question, maxLen);
        try {
            const response = await openai.createCompletion({
                prompt: `Answer the question based on the context below, and if the question can't be answered based on the context, say "I don't know"\n\nContext: ${context}\n\n---\n\nQuestion: ${question}\nAnswer:`,
                temperature: 0,
                max_tokens: maxTokens,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                model: "text-davinci-003",
            });
            return response.data.choices[0].text.trim();
        } catch (error) {
            if (error.response) {
                console.log(error.response.status);
                console.log(error.response.data);
            } else {
                console.log(error.message);
            }
            console.log("OpenAI is probably down, https://status.openai.com");
            return "";
        }
    }

    // loop input prompt the user for a question
    while (true) {
        const question = readline.question("Question: ");
        const answer = await answerQuestion(question);
        if (!answer) {
            // terminate
            console.error("No answer found");
            break;
        }
        console.log("Answer: " + answer);
    }
}

fn();
