<!--suppress ALL -->
<h1 align="center">Installing (and running) <a href="https://github.com/heyngra/osu-sniper">osu!sniper</a></h1>

## Installation
1. Clone the repo.
2. Install [node.js](https://nodejs.org/en/). Instal version 16.x
3. Open cloned repo and install dependencies:<br>
Run: `npm install .`
4. Install dependencies in rewind folder:<br>
Run: 
```
cd rewind
npm install --global yarn
yarn install
```
5. Create a file called 'pass.json and fill it with data:
```json
{
  "CLIENT_ID": "your osu client id (generate at https://osu.ppy.sh/home/account/edit)",
  "CLIENT_SECRET": "your osu client secret ^",
  "twitterAppKey": "twitter app key (generate @ https://developer.twitter.com",
  "twitterSecret": "same as above",
  "twitterAccessToken": "Generate it using generate_twitter_oauth.js",
  "twitterAccessSecret": "^",
  "ircNickname": "https://osu.ppy.sh/p/irc (username)",
  "ircFullname": "https://osu.ppy.sh/p/irc (username)",
  "ircPassword": "https://osu.ppy.sh/p/irc (server password)",
  "redirect_uri": "your osu outh2 redirect uri (https://osu.ppy.sh/home/account/edit)",
  "chromePath": null, "(leave it as null and remove this if you are using default chrome, change it you are running it for example on raspbery pi": "",
  "username": "your osu nickname",
  "password": "your osu password, encoded with generate_encoded_password.js"
}
```
6. Download font from [here](https://www.dafont.com/lemon-milk.font) and [here](https://github.com/adobe-fonts/emojione-color/raw/master/EmojiOneColor.otf).
If you're on Linux, you should follow [this guide](https://askubuntu.com/questions/18357/how-to-install-otf-fonts) to
install this font. If you're on Windows, just install it normally.
7. Run the main bot app using `node index.js`
8. Edit [enviroment.ts](https://github.com/heyngra/rewind/blob/master/apps/web/src/environments/environment.ts) with your desktop-backend's ip. If you aren't using any tunnels, it is `http://localhost:7271`
9. Run the rewind lookup app using `npx nx run web:serve --allowed-hosts all --https` and `npx nx run desktop-backend:serve` in rewind folder

## Cloudflared Tunnel

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation)
2. Create three tunnels:
* http://localhost:7271
* http://localhost:4200
* http://localhost:6120