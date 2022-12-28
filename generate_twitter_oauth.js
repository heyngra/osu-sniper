// generate Twitter account oauth token
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const pass = JSON.parse(fs.readFileSync('pass.json').toString());
const fetch = require('node-fetch');
const oauth_callback = "http://localhost:2137"; //there you should put your callback URL you've set on dev.twitter.com
const twitterClient = new TwitterApi({
    appKey: pass['twitterAppKey'],
    appSecret: pass['twitterSecret']
});
const oauth_token = "WJGPbwAAAAABNkPfAAABhVnTpsE";
const oauth_verifier = "emA52rtJ8C6RXIBzDWTE4fUmMD7JJJqh";
async function main() {
    if (oauth_token === "") {
        const authLink = await twitterClient.generateAuthLink(oauth_callback)
        console.log("Please go to " + authLink.url + ", verify and paste from the URL the oauth_token and oauth_verifier into the source code.")
        return
    }
    fetch(`https://api.twitter.com/oauth/access_token?oauth_verifier=`+oauth_verifier+`&oauth_token=`+oauth_token, {
        method: 'POST'
    }).then(res => res.text()).then(body => {
        console.log(body.split("&").join("\n")); // take oauth_token and oauth_token_secret from here (from console output)
    });

}
main();