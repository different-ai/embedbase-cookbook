# web-crawl-q-and-a

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/another-ai/embedbase-cookbook)

This example shows how to use Embedbase to answer questions about a website.

## Usage

To follow through the Jupyter notebook, you first need to run the following commands:

```bash
virtualenv env
source env/bin/activate
pip install -r requirements.txt
```

For the interactive JavaScript demo, you need to run the following commands:

```bash
npm install
````

```bash
EMBEDBASE_API_KEY="<https://app.embedbase.xyz/dashboard>" OPENAI_API_KEY="<https://platform.openai.com/account/api-keys>" node web-qa.js
# now try "What is our newest embeddings model?"
# or "What is ChatGPT?"
```

If you don't have an Embedbase account and associated API key [create a free account](https://app.embedbase.xyz/signup) and an OpenAI account and associated API key [create a free account](https://beta.openai.com/signup).
