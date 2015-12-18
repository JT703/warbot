var Botkit = require('botkit'),
    request = require('request');

var dmList = [];
var slackApi = {
  host: "https://slack.com/api",
  token: 'xoxb-16961630054-6zTszaakr1LN28E7IynXM5o2'
};

var controller = Botkit.slackbot();
var bot = controller.spawn({
  token: 'xoxb-16961630054-6zTszaakr1LN28E7IynXM5o2'
});
bot.startRTM(function(err,bot,payload) {
  if (err) {
    throw new Error('Could not connect to Slack');
  }

  // Get the list of DMs (players)
  request.get(slackApi.host + '/im.list?token=' + slackApi.token, function (error, response, body) {

    if (!error && response.statusCode == 200) {

      var results = JSON.parse(body);

      if (results.ims) {
        dmList = results.ims;
        console.info("Got the DM list.");
      }

    } else {
      console.error(error);
    }

  });
});

var players = {};
var nextTurnId;

var defenderObj;
var attackerObj;

var attackValue;
var defenseValue;

//
// ATTACK
//
controller.hears(["^attack <@\\S+> ([1-9]|10)$"],["direct_message"],function(bot,message) {

  console.log(message);

  if (!attackerObj) {

    if (nextTurnId == null || message.user == nextTurnId) {

      var messageTextParts = message.text.split(" ");

      attackValue = parseInt(messageTextParts[2]);
      var tmpAttackerObj = getDMbyUserId(message.user);
      // Init attacking player's setup
      if (!players[tmpAttackerObj.user]) {
        players[tmpAttackerObj.user] = {
          dm: tmpAttackerObj,
          inventory: getNewInventory()
        };
      }

      var defenderId = messageTextParts[1].substring(2,messageTextParts[1].length - 1);
      var tmpDefenderObj = getDMbyUserId(defenderId);
      // Init defending player's setup
      if (!players[tmpDefenderObj.user]) {
        players[tmpDefenderObj.user] = {
          dm: tmpDefenderObj,
          inventory: getNewInventory()
        };
      }

      var currentInventoryLevel = players[tmpAttackerObj.user].inventory[attackValue];
      if (currentInventoryLevel > 0) {
        // Confirm attack
        bot.reply(message,"OK. Attacking " + messageTextParts[1] + " with " + attackValue + ".");

        defenderObj = tmpDefenderObj;
        attackerObj = tmpAttackerObj;

        // Notify Defender
        notifyDefender();
      } else {
        // Confirm attack
        bot.reply(message,"You have no remaining " + attackValue + "'s left.");
      }

    } else {
      // Confirm attack
      bot.reply(message,"It's not your turn.");
    }

  } else {
    bot.reply(message,"Can't attack right now.\n<@" + attackerObj.user +
                      "> is currently attacking <@" + defenderObj.user + ">.");
  }

  console.log(players);

});

//
// DEFEND
//
controller.hears(["^defend ([0-9]|10)$"],["direct_message"],function(bot,message) {

  console.log(message);

  if (message.user == defenderObj.user) {

    defenseValue = parseInt(message.text.split(" ")[1]);

    var currentInventoryLevel = players[defenderObj.user].inventory[defenseValue];
    if (currentInventoryLevel > 0) {
      // Confirm attack
      bot.reply(message,"OK. Defended with " + defenseValue + ".");

      // Notify Players of attack results
      setTimeout(sendAttackResults, 30000);
    } else {
      // Confirm attack
      bot.reply(message,"You have no remaining " + defenseValue + "'s left'.");
    }

  } else {
      bot.reply(message,"Can't defend right now.\n<@" + attackerObj.user +
                        "> is currently attacking <@" + defenderObj.user + ">.");
  }

  console.log(players);

});


//
// Inventory
//
controller.hears(["^inventory$"],["direct_message"],function(bot,message) {

  console.log(message);

  var i = players[message.user].inventory;
  bot.reply(message,"You have...\n" +
                    i[0] + " 0's (bombs)\n" +
                    i[1] + " 1's\n" +
                    i[2] + " 2's\n" +
                    i[3] + " 3's\n" +
                    i[4] + " 4's\n" +
                    i[5] + " 5's\n" +
                    i[6] + " 6's\n" +
                    i[7] + " 7's\n" +
                    i[8] + " 8's\n" +
                    i[9] + " 9's\n" +
                    i[10] + " 10's");


  console.log(players);

});

// Notify the defender that they are being attacked
function notifyDefender() {

  bot.say({
    type: "message",
    channel: defenderObj.id,
    text: "You are being attacked by <@" + attackerObj.user + ">. Defend yourself (reply with `defend [0-10]`)",
  });

}

function sendAttackResults() {

  var wl = findWinnerLoser();
  var winner = wl.winner;
  var loser  = wl.loser;
  var resultText = "<@" + attackerObj.user +
                   "> attacked with " + attackValue + ".\n" +
                   "<@" + defenderObj.user +
                   "> defended with " + defenseValue + ".\n" +
                   "<@" + winner.user + "> wins this attack!";

  if (wl.attackerWon) {
    var currentInventoryLevel = players[defenderObj.user].inventory[defenseValue];
    players[defenderObj.user].inventory[defenseValue] = --currentInventoryLevel;
  } else {
    var currentInventoryLevel = players[attackerObj.user].inventory[attackValue];
    players[attackerObj.user].inventory[attackValue] = --currentInventoryLevel;
  }

  // Tell Attacker results of the current attack
  bot.say({
    type: "message",
    channel: attackerObj.id,
    text: resultText,
  });

  // Tell Defender results of the current attack
  bot.say({
    type: "message",
    channel: defenderObj.id,
    text: resultText,
  });

  // Check for game over
  if (isGameOver(loser.user)) {
    var resultText = "<@" + winner.user + "> wins the battle!";

    // Tell Winner results of the battle
    bot.say({
      type: "message",
      channel: winner.id,
      text: resultText,
    });

    // Tell Loser results of the battle
    bot.say({
      type: "message",
      channel: loser.id,
      text: resultText,
    });

    resetBattleground();
  } else {

    // Tell Defender it's their turn
    bot.say({
      type: "message",
      channel: defenderObj.id,
      text: "It's your turn to attack.",
    });

    nextTurnId = defenderObj.user;
    resetAttack();

  }

}

function getDMbyUserId(userId) {

  return dmList.filter(function(dm) {
    return dm.user == userId;
  })[0];

}

function findWinnerLoser() {

  // Bomb scenarios
  if (defenseValue === 0 && attackValue !== 3) {
    return {winner: defenderObj, loser: attackerObj, attackerWon: false};
  }
  if (defenseValue === 0 && attackValue === 3) {
    return {winner: attackerObj, loser: defenderObj, attackerWon: true};
  }

  // Standard rank scenarios (1's beat 10's)
  if (attackValue >= defenseValue) {
    if (attackValue === 10 && defenseValue === 1) {
      return {winner: defenderObj, loser: attackerObj, attackerWon: false};
    } else {
      return {winner: attackerObj, loser: defenderObj, attackerWon: true};
    }
  } else {
    if (attackValue === 1 && defenseValue === 10) {
      return {winner: attackerObj, loser: defenderObj, attackerWon: true};
    } else {
      return {winner: defenderObj, loser: attackerObj, attackerWon: false};
    }
  }

}

function resetAttack() {

  defenderObj = null;
  attackerObj = null;
  attackValue = null;
  defenseValue = null;

}

function resetBattleground() {

  players = {};

}

function getNewInventory() {
  // return [
  //   3, // 0's bombs
  //   1, // 1's
  //   3, // 2's
  //   3, // 3's
  //   1, // 4's
  //   1, // 5's
  //   1, // 6's
  //   1, // 7's
  //   1, // 8's
  //   1, // 9's
  //   1, // 10's
  // ];
  return [
    0, // 0's bombs
    0, // 1's
    0, // 2's
    0, // 3's
    0, // 4's
    1, // 5's
    1, // 6's
    0, // 7's
    0, // 8's
    0, // 9's
    0, // 10's
  ];
}

function isGameOver(loserId) {

  return players[loserId].inventory.every(function(element) {
    return element == 0;
  });

}
