var bot = require('../discordClient.js');

var consts = require('../consts.js');
var db = require('../db.js');
var formatting = require('../formatting.js');
var rlClient = require('../rlClient.js');

var logger = require('winston');

/**
 * Ladder command, !ladder <playlist>
 * Finds all ranked people in the playlist, and shows their cached results them in order.
 */
function run(discordName, discordID, channelID, message, evt, args) {
    var playlists = formatting.parsePlaylistArgs(args);
    if (playlists.length != 1) {
        bot.sendMessage({
            to: channelID,
            message: "A single playlist must be provided."
        });
        return;
    }
    var rankedUsers = [];
    var playlist = playlists[0];
    var rlPlaylist = rlClient.playlistNameToID(playlist);

    // First step, load all the users:
    logger.info("Finding all users...");
    db.User.find(function (err, users) {
        if (err) {
            logger.error("Error loading users.");
            return;
        }
        var userMap = {};
        var batchPayload = [];
        for (user of users) {
            userMap[user['steamId']] = user;
            batchPayload.push({"platformId": user.platform, "uniqueId": user.steamId});
        }

        // Next step, query for all their ranks in one go:
        logger.info("Getting all stats for " + batchPayload.length + " users...");
        rlClient.getStatsBatch(batchPayload).then(
            function (userRatings) {
                var rankedRatings = [];
                logger.info("  ..." + userRatings.length + " ratings returned");
                for (userRating of userRatings) {
                    // Need rating from RL API...
                    var rating = userRating
                        && userRating.rankedSeasons
                        && userRating.rankedSeasons[consts.CurrentSeason]
                        && userRating.rankedSeasons[consts.CurrentSeason][rlPlaylist];
                    // ... and user from Discord
                    var user = userMap[userRating.uniqueId];
                    if (user && rating) {
                        rankedRatings.push({
                            'user': user,
                            'data': rating,
                        });
                    }
                }
                logger.info("  ... " + rankedRatings.length + " of those ratings have matching users");
                // Finally, sort by MMR and format the final message:
                rankedRatings.sort(function (a, b) {
                  if (a.data.rankPoints != b.data.rankPoints) {
                    // Highest MMR name first.
                    return b.data.rankPoints - a.data.rankPoints;
                  } else {
                    // Then lowest name.
                    return a.user.name.localeCompare(b.user.name);
                  }
                });
                var message = formatting.ladderToText(rankedRatings);
                bot.sendMessage({
                    to: channelID,
                    embed: {
                        color: consts.Color.GREEN,
                        title: "Current ladder for " + playlist + ": ",
                        description: message
                    }
                });
            }
        )
    });
}

module.exports = {
  run: run
};
