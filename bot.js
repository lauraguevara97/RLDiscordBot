var auth = require('./auth.json');
var properties = require('./properties.json');

// Mongo Code
var mongoose = require('mongoose');
// Mongoose Schema definition
var userSchema = new mongoose.Schema({
    steamId: String,
    discordId: String,
    name: String,
    platform: Number
});

var seasonStatSchema = new mongoose.Schema({
    discordId: String,
    data: Object
});

User = mongoose.model('UsersDB', userSchema);
Stat = mongoose.model('SeasonStatsDB', seasonStatSchema);

var uri = "mongodb://"
        + properties.mongo_user + ":" + auth.mongo_pass + "@"
        + "rldiscordbot-shard-00-00-k9ogi.mongodb.net:27017"
        + ",rldiscordbot-shard-00-01-k9ogi.mongodb.net:27017"
        + ",rldiscordbot-shard-00-02-k9ogi.mongodb.net:27017"
        + "/" + properties.mongo_db
        + "?ssl=true&replicaSet=RLDiscordBot-shard-0&authSource=admin"
    ;

mongoose.connect(uri, function (err) {
    if (err) console.error(err);
    else console.log('mongo connected');
});
// End of Mongo Code

var Discord = require('discord.io');
var logger = require('winston');
var rls = require('rls-api');
var RLClient = new rls.Client({
    token: auth.rl_token
});
var users = require('./users.json');
var platforms = {
    "PC": 1,
    "PS4": 2,
    "XBOX": 3
};
// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
    colorize: true
});

logger.level = 'debug';
// Initialize Discord Bot
var bot = new Discord.Client({
    token: auth.discord_token,
    autorun: true
});
bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
});

bot.on('message', function (discordName, discordID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
        switch (cmd) {
            // !ping
            case 'ping':
                bot.sendMessage({
                    to: channelID,
                    message: 'Pong!, your turn ' + discordName
                });
                break;
            case 'debug':
                var message = "{\nuser=" + discordName + "\n,userId=" + discordID + "\n,message=" + message;
                bot.sendMessage({
                    to: channelID,
                    message: message
                });
                break;
            case 'update':
                logger.debug("Getting update for " + args[1]);
                User.find({"discordId": discordID}, function (user) {
                    getStats(user.steamId, user.platform).then(
                        function (response) {
                            bot.sendMessage({
                                to: channelID,
                                message: JSON.stringify(response.rankedSeasons)
                            });
                        });
                });
                break;
            case 'register':
                if (!args[1] || !args[2]) {
                    bot.sendMessage({
                        to: channelID,
                        message: "The usage is !register player-name platform"
                    });
                    break;
                }
                logger.debug("Registering player=" + args[1] + ", platform=" + platforms[args[2]]);
                getStats(args[1], platforms[args[2]]).then(
                    function (data) {
                        var newUser = new User({
                            "discordId": discordID,
                            "steamId": data.uniqueId,
                            "name": data.displayName,
                            "platform": platforms[args[2]]
                        });
                        newUser.save(function (err) {
                            logger.debug("new user registered: " + JSON.stringify(err));
                            bot.sendMessage({
                                to: channelID,
                                message: "You have been registered"
                            });
                        });
                    },
                    function (err) {
                        bot.sendMessage({
                            to: channelID,
                            message: "Cannot find player " + args[1] + " for platform " + args[2]
                        });
                    }
                );
                break;
            case 'list':
                User.find({}, function (response) {
                    bot.sendMessage({
                        to: channelID,
                        message: JSON.stringify(response)
                    });
                });
                break;
            // Just add any case commands if you want to..
        }
    }
});

function getUser(name) {
    var user = {};
    if (users[name])
        user = users[name];
    return user;
}

function getStats(steamId, platform) {
    return new Promise(function (resolve, reject) {
        RLClient.getPlayer(steamId, platform, function (status, data) {
            logger.debug(status);
            if (status === 200) {
                resolve(data);
            }
            else {
                reject(status);
            }
        });
    });
}

function formatData(playerData) {
    var message = JSON.stringify(playerData.rankedSeasons);
    return message;
}
