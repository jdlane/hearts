const http = require("http");
const path = require("path");
const express = require("express");
const socketio = require("socket.io");
const session = require("express-session");
const { v4: uuidv4 } = require("uuid");
const { generateKeyPair } = require("crypto");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

//use ejs
app.set("view-engine", "ejs");

//request parser for post requests
app.use(require("body-parser").urlencoded({ extended: true }));

//set static folder to /public
app.use("/", express.static(path.join(__dirname, "public")));

//init session
const sessionMiddleware = session({
  secret: "secret",
  resave: false,
  store: new (require("connect-pg-simple")(session))(),
  saveUninitialized: false,
});
app.use(sessionMiddleware);

//share sessions with sockets
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

//deck
const deck = [
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
  "C9",
  "C10",
  "C11",
  "C12",
  "C13",
  "C14",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S9",
  "S10",
  "S11",
  "S12",
  "S13",
  "S14",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
  "D7",
  "D8",
  "D9",
  "D10",
  "D11",
  "D12",
  "D13",
  "D14",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "H7",
  "H8",
  "H9",
  "H10",
  "H11",
  "H12",
  "H13",
  "H14",
];

const waitlist = [];
const games = [];

const initGame = (game) => {
  game.round = 0;
  game.playersJoined = 0;
  for (player of game.players) {
    player.points = 0;
    player.hand = [];
    player.cardsTaken = [];
  }
  game.heartsBroken = false;
  game.firstMove = true;
  game.moonShooter = null;
  game.trick = [];
  game.ledSuit = false;
  game.passing = true;
  game.passDirection = "across";

  let hands = deal();
  for (let i = 0; i < 4; i++) {
    game.players[i].hand = sortCards(hands[i]);
  }
};

const countPoints = (arr, game) => {
  let hearts = 0;
  for (c of arr) {
    if (c[0] === "H") hearts++;
    if (c === "S12") hearts += 13;
    if (c === "D11" && game.jackOfDiamonds) hearts -= 10;
  }
  return hearts;
};

const newTrick = (game) => {
  let taker = game.trick.reduce((a, v) => {
    if (v.card[0] === game.ledSuit) {
      return parseInt(a.card.slice(1)) > parseInt(v.card.slice(1)) ? a : v;
    } else {
      return a;
    }
  });
  game.ledSuit = false;
  game.turn = taker.playerIndex;
  game.trickStarter = taker.playerIndex;
  for (c of game.trick) {
    game.players[taker.playerIndex].cardsTaken.push(c.card);
  }
  game.trick = [];
  gameNamespace.to(game.id).emit("newTrick", taker.playerIndex);

  if (game.players[0].hand.length === 0) {
    newHand(game);
  }
};

const checkMoonShot = (game) => {
  let shot = null;
  for (player of game.players) {
    let hearts = 0;
    for (c of player.cardsTaken) {
      if (c) {
        if (c[0] === "H") hearts++;
        if (c === "S12") hearts += 13;
      }
    }
    if (hearts === 26) {
      shot = player;
      break;
    }
  }
  return shot;
};

const newHand = (game) => {
  let moonShooter = checkMoonShot(game);

  game.heartsBroken = false;
  game.firstMove = true;
  game.trick = [];
  game.ledSuit = false;
  game.passDirection = nextPass(game.passDirection);

  let hands = deal();
  for (let i = 0; i < 4; i++) {
    game.players[i].hand = sortCards(hands[i]);
    /*if (hands[i].includes("C2")) {
      game.turn = i;
      game.trickStarter = i;
    }*/
  }

  gameNamespace.to(game.id).emit("newTrick", "");

  if (moonShooter) {
    game.moonShooter = moonShooter;
    gameNamespace.to(game.id).emit("moonShot");
  } else {
    let scores = [];
    let gameOver = false;
    let leastPointsPlayer = game.players.reduce((a, v) => {
      return v.points < a.points ? v : a;
    });
    for (p of game.players) {
      p.points += countPoints(p.cardsTaken, game);
      scores.push(p.points);
      if (p.points >= game.maxScore) {
        gameOver = true;
        for (p2 of game.players) {
          if (
            p2 !== p &&
            p2.points === p.points &&
            p2.points === leastPointsPlayer.points
          ) {
            gameOver = false;
          }
        }
      }
      p.cardsTaken = [];
    }
    if (gameOver) {
      gameNamespace
        .to(game.id)
        .emit("gameOver", { winner: leastPointsPlayer.name, scores: scores });
    } else {
      gameNamespace.to(game.id).emit("handOver", scores);
      if (game.passDirection !== "hold") {
        game.passing = true;
        gameNamespace.to(game.id).emit("isPassing", {
          isPassing: true,
          direction: game.passDirection,
        });
      } else {
        for (player of game.players) {
          player.passed = false;
          if (player.hand.includes("C2")) {
            game.turn = game.players.indexOf(player);
            game.trickStarter = game.players.indexOf(player);
            gameNamespace
              .to(game.id)
              .emit("newTurn", game.players.indexOf(player));
          }
        }
        game.passing = false;
        gameNamespace.to(game.id).emit("passingOver");
      }
    }
  }
};

const getGameByID = (id) => {
  return games.find((g) => {
    return g.id === id;
  });
};

const getPlayerOfGame = (pid, gid) => {
  let game = getGameByID(gid);
  if (!game) {
    return null;
  }
  return game.players.find((p) => {
    return p.id === pid;
  });
};

const deal = () => {
  let tempDeck = [...deck];
  let hands = [[], [], [], []];
  for (let i = 0; i < 52; i++) {
    let dealt = tempDeck[Math.floor(Math.random() * tempDeck.length)];
    hands[i % 4].push(dealt);
    tempDeck.splice(tempDeck.indexOf(dealt), 1);
  }
  return hands;
};

const hasSuit = (player, suit) => {
  if (!player || !player.hand) return null;
  return player.hand.find((card) => {
    return card[0] === suit;
  });
};

const suitToNumber = (s) => {
  if (s === "C") {
    return 0;
  }
  if (s === "S") {
    return 1;
  }
  if (s === "D") {
    return 2;
  }
  if (s === "H") {
    return 3;
  }
};

const nextPass = (current) => {
  if (current === "left") {
    return "right";
  }
  if (current === "hold") {
    return "left";
  }
  if (current === "right") {
    return "across";
  }
  if (current === "across") {
    return "hold";
  }
  return "left";
};

const getPassPlayer = (game, player) => {
  if (game && player && game.players.includes(player)) {
    if (game.passDirection === "left") {
      return game.players[(game.players.indexOf(player) + 1) % 4];
    } else if (game.passDirection === "right") {
      return game.players[(game.players.indexOf(player) + 3) % 4];
    } else if (game.passDirection === "across") {
      return game.players[(game.players.indexOf(player) + 2) % 4];
    } else if (game.passDirection === "hold") {
      return null;
    }
  } else {
    return null;
  }
};

const sortCards = (cards) => {
  return cards.sort((a, b) => {
    let suit = suitToNumber(a[0]) - suitToNumber(b[0]);
    if (suit !== 0) {
      return suit;
    }
    return a.slice(1) - b.slice(1);
  });
};

app.get("/", (req, res) => {
  if (!req.session.playerId) {
    req.session.playerId = uuidv4();
  }
  if (waitlist.length === 0) {
    res.render("index.ejs", { firstPlayer: true });
  } else {
    res.render("index.ejs", {
      firstPlayer: false,
      jod: waitlist[0].jod,
      maxScore: waitlist[0].maxScore,
    });
  }
});

app.get("/game", (req, res) => {
  //check if game id exists
  if (!req.query.gid || !req.session.playerId) {
    res.redirect("/");
  } else {
    let game = games.find((game) => {
      return game.id === req.query.gid;
    });
    if (game) {
      let thisPlayer = game.players.find((player) => {
        return player.id === req.session.playerId;
      });
      //check if player is in this game
      if (!thisPlayer) {
        res.redirect("/");
      } else {
        let playerIndex = game.players.indexOf(thisPlayer);
        let showTrick = [];
        for (let i = 0; i < 4; i++) {
          let trickCard = game.trick.find((card) => {
            return card.playerIndex === i;
          });
          if (trickCard) {
            showTrick.push(trickCard);
          } else {
            showTrick.push({ card: "blank", playerIndex: i });
          }
        }
        res.render("game.ejs", {
          thisPlayer: {
            name: thisPlayer.name,
            cards: thisPlayer.hand,
            realIndex: playerIndex,
            points: thisPlayer.points,
          },
          player1: {
            name: game.players[(playerIndex + 1) % 4].name,
            realIndex: (playerIndex + 1) % 4,
            points: game.players[(playerIndex + 1) % 4].points,
          },
          player2: {
            name: game.players[(playerIndex + 2) % 4].name,
            realIndex: (playerIndex + 2) % 4,
            points: game.players[(playerIndex + 2) % 4].points,
          },
          player3: {
            name: game.players[(playerIndex + 3) % 4].name,
            realIndex: (playerIndex + 3) % 4,
            points: game.players[(playerIndex + 3) % 4].points,
          },
          turn: game.turn,
          trick: showTrick,
        });
      }
    } else {
      res.redirect("/");
    }
  }
});

const gameNamespace = io.of("/game");

io.on("connection", (socket) => {
  //queued up event
  socket.on("waiting", (data) => {
    //check if player is already waiting
    if (
      waitlist.find((player) => {
        return player.id === socket.request.session.playerId;
      })
    ) {
      socket.emit("err", "already waiting");
    } else {
      //add to waitlist and make new game if 4 are waiting
      if (waitlist.length === 0) {
        if (
          typeof data.jod === "undefined" ||
          typeof data.to100 === "undefined"
        ) {
          socket.emit("findFailed");
        } else {
          let gid = uuidv4();
          waitlist.push({
            id: socket.request.session.playerId,
            name: data.name,
            gameId: gid,
            jod: data.jod,
            maxScore: data.to100 ? 100 : 50,
          });
          socket.emit("queued", data.name);
          socket.join(gid);
          socket.request.session.set;
          socket.request.session.gameId = gid;
          io.to(gid).emit("playerJoined", 1);
          io.emit("firstPlayerJoined", {
            jod: data.jod,
            maxScore: data.to100 ? 100 : 50,
          });
        }
      } else if (waitlist.length < 4) {
        waitlist.push({
          id: socket.request.session.playerId,
          name: data.name,
          gameId: waitlist[0].gameId,
        });
        socket.emit("queued", data.name);
        socket.join(waitlist[0].gameId);
        socket.request.session.gameId = waitlist[0].gameId;
        io.to(waitlist[0].gameId).emit("playerJoined", waitlist.length);
        if (waitlist.length === 4) {
          let game = {
            id: waitlist[0].gameId,
            jackOfDiamonds: waitlist[0].jod,
            maxScore: waitlist[0].maxScore,
            players: waitlist.splice(0, 4),
          };
          games.push(game);
          io.to(game.id).emit("startGame", game);
          initGame(game);
        }
      } else {
        let gid = uuidv4();
        waitlist.push({
          id: socket.request.session.playerId,
          name: data.name,
          gameId: gid,
        });
        socket.emit("queued", data.name);
        socket.join(gid);
        socket.request.session.gameId = gid;
        io.to(gid).emit("playerJoined", 0);
      }
      socket.request.session.save();
    }
  });

  //disconnection
  socket.on("disconnect", () => {
    let player = waitlist.find((player) => {
      return player.id === socket.request.session.playerId;
    });
    if (player) {
      waitlist.splice(waitlist.indexOf(player), 1);
      if (waitlist.length > 0) {
        io.to(waitlist[0].gameId).emit("playerJoined", waitlist.length);
      } else {
        io.emit("waitlistEmpty");
      }
    }
  });
});

gameNamespace.on("connection", (socket) => {
  //player joined game event
  socket.on("joined", () => {
    game = getGameByID(socket.request.session.gameId);
    if (
      socket.request.session.gameId &&
      socket.request.session.playerId &&
      game
    ) {
      socket.join(socket.request.session.gameId);
      let game = getGameByID(socket.request.session.gameId);
      game.playersJoined++;
      /*if (game.playersJoined === 4) {
        io.to(game.id).emit("newTurn", game.turn);
      }*/
    }
  });
  //played a card event
  socket.on("playCard", (data) => {
    game = getGameByID(socket.request.session.gameId);
    player = getPlayerOfGame(
      socket.request.session.playerId,
      socket.request.session.gameId
    );
    if (
      game &&
      socket.request.session.playerId &&
      socket.request.session.gameId &&
      player
    ) {
      if (game.passing) {
        socket.emit("turnFailed", "can't play cards during passing phase");
        //check if player played points of first turn
      } else if (
        player.hand.length === 13 &&
        data.card[0] === "H" &&
        (hasSuit(player, "S") || hasSuit(player, "C") || hasSuit(player, "D"))
      ) {
        socket.emit("turnFailed", "You can't play points on the first turn");
      } else if (player.hand.length === 13 && data.card === "S12") {
        socket.emit("turnFailed", "You can't play points on the first turn");
        //check if this player's turn
      } else if (game.turn !== game.players.indexOf(player)) {
        socket.emit("turnFailed", "not your turn");
        //check if player has that card at that index
      } else if (!player.hand.includes(data.card)) {
        socket.emit("turnFailed", "card error");
      } else {
        //check if suit is playable
        if (game.firstMove && data.card != "C2") {
          socket.emit("turnFailed", "You must play the 2 of clubs");
        } else if (
          game.ledSuit &&
          game.ledSuit !== data.card[0] &&
          hasSuit(player, game.ledSuit)
        ) {
          socket.emit("turnFailed", "You must play the suit that was led");
        } else if (
          data.card[0] === "H" &&
          !game.heartsBroken &&
          !game.ledSuit &&
          (hasSuit(player, "S") || hasSuit(player, "C") || hasSuit(player, "D"))
        ) {
          socket.emit("turnFailed", "Hearts aren't broken");
        } else {
          //turn successful
          socket.emit("turnSuccessful", data);
          gameNamespace.to(socket.request.session.gameId).emit("cardPlayed", {
            playerIndex: game.players.indexOf(player),
            card: data.card,
          });
          //if first card of trick set led suit
          if (game.trick.length === 0) {
            game.ledSuit = data.card[0];
          }
          //add card to trick
          game.trick.push({
            card: data.card,
            playerIndex: game.players.indexOf(player),
          });
          //remove card from hand
          player.hand.splice(player.hand.indexOf(data.card), 1);
          if (game.firstMove) game.firstMove = false;
          //break hearts if broken
          if (!game.heartsBroken && data.card[0] === "H")
            game.heartsBroken = true;
          //check if last move of trick
          if (game.trickStarter === (game.players.indexOf(player) + 1) % 4) {
            game.seenTrick = { count: 0, players: [] };
            gameNamespace.to(socket.request.session.gameId).emit("trickDone");
          } else {
            gameNamespace
              .to(socket.request.session.gameId)
              .emit("newTurn", (game.players.indexOf(player) + 1) % 4);
            game.turn = (game.players.indexOf(player) + 1) % 4;
            if (!game.ledSuit) {
              game.ledSuit = data.card[0];
            }
          }
        }
      }
    } else {
      socket.emit("turnFailed", "server error");
    }
  });
  //don't clear table until all players have seen
  socket.on("seenTrick", () => {
    game = getGameByID(socket.request.session.gameId);
    player = getPlayerOfGame(
      socket.request.session.playerId,
      socket.request.session.gameId
    );
    if (
      game &&
      player &&
      !game.seenTrick.players.includes(game.players.indexOf(player))
    ) {
      game.seenTrick.count++;
      game.seenTrick.players.push(game.players.indexOf(player));
      if (game.seenTrick.count === 4) {
        newTrick(game);
      }
    }
  });

  //player requests next hand
  socket.on("requestHand", () => {
    game = getGameByID(socket.request.session.gameId);
    player = getPlayerOfGame(
      socket.request.session.playerId,
      socket.request.session.gameId
    );
    if (game && player) {
      if (player.hand.length === 13) {
        socket.emit("newHand", player.hand);
      }
    }
  });

  //player asks if passing
  socket.on("checkPassing", () => {
    game = getGameByID(socket.request.session.gameId);
    if (game) {
      socket.emit("isPassing", {
        isPassing: game.passing,
        direction: game.passDirection,
      });
    }
  });

  //player passes cards
  socket.on("passCards", (cards) => {
    game = getGameByID(socket.request.session.gameId);
    player = getPlayerOfGame(
      socket.request.session.playerId,
      socket.request.session.gameId
    );
    let recievingPlayer = getPassPlayer(game, player);
    if (game && player) {
      if (player.passed) {
        socket.emit("alreadyPassed");
      } else if (!recievingPlayer) {
        socket.emit("passFailed", "passing error");
      } else if (!game.passing) {
        socket.emit("passFailed", "not time to pass");
        socket.emit("isPassing", {
          isPassing: false,
        });
      } else if (cards.length !== 3) {
        socket.emit("passFailed", "you must pass 3 cards");
      } else if (
        player.hand.includes(cards[0].card) &&
        player.hand.includes(cards[1].card) &&
        player.hand.includes(cards[2].card)
      ) {
        socket.emit("isPassing", {
          isPassing: false,
        });
        for (card of cards) {
          player.hand.splice(player.hand.indexOf(card.card), 1);
          recievingPlayer.hand.push(card.card);
          player.hand = sortCards(player.hand);
          recievingPlayer.hand = sortCards(recievingPlayer.hand);
        }
        player.passed = true;
        socket.emit("passSuccessful", cards);
        //check if all have passed
        if (
          !game.players.find((player) => {
            return !player.passed;
          })
        ) {
          for (player of game.players) {
            player.passed = false;
            if (player.hand.includes("C2")) {
              game.turn = game.players.indexOf(player);
              game.trickStarter = game.players.indexOf(player);
              gameNamespace
                .to(game.id)
                .emit("newTurn", game.players.indexOf(player));
            }
          }
          game.passing = false;
          gameNamespace.to(game.id).emit("passingOver");
        }
      } else {
        socket.emit("passFailed", "card error");
      }
    } else {
      socket.emit("passFailed", "gamee error");
    }
  });

  //player asks if they shot moon
  socket.on("moonShotRequest", () => {
    game = getGameByID(socket.request.session.gameId);
    player = getPlayerOfGame(
      socket.request.session.playerId,
      socket.request.session.gameId
    );
    if (game && player && game.moonShooter) {
      if (player === game.moonShooter) {
        socket.emit("shotTheMoon", { thisPlayer: true });
      } else {
        socket.emit("shotTheMoon", {
          thisPlayer: false,
          playerName: game.moonShooter.name,
        });
      }
    }
  });

  //player made shoot the moon choice
  socket.on("moonChoice", (choice) => {
    game = getGameByID(socket.request.session.gameId);
    player = getPlayerOfGame(
      socket.request.session.playerId,
      socket.request.session.gameId
    );
    if (game && player) {
      if (game.moonShooter !== player) {
        socket.emit("shotTheMoon", {
          thisPlayer: false,
          playerName: game.moonShooter.name,
        });
      } else if (choice !== 1 && choice !== 0) {
        socket.emit("moonFailed", "selection error");
      } else {
        game.moonShooter = null;
        if (choice === 0) {
          player.points -= 26;
        } else if (choice === 1) {
          for (p of game.players) {
            if (player != p) {
              p.points += 26;
            }
          }
        }

        let scores = [];
        let gameOver = false;
        let leastPointsPlayer = game.players.reduce((a, v) => {
          return v.points < a.points ? v : a;
        });
        for (p of game.players) {
          if (p != player) {
            p.points += countPoints(p.cardsTaken, game);
          } else if (p.cardsTaken.includes("D11")) {
            p.points -= 10;
          }
          scores.push(p.points);
          p.cardsTaken = [];
        }
        for (p of game.players) {
          if (p.points >= game.maxScore) {
            gameOver = true;
            for (p2 of game.players) {
              if (
                p2 !== p &&
                p2.points === p.points &&
                p2.points === leastPointsPlayer.points
              ) {
                gameOver = false;
              }
            }
          }
        }
        if (gameOver) {
          gameNamespace.to(game.id).emit("gameOver", {
            winner: leastPointsPlayer.name,
            scores: scores,
          });
        } else {
          gameNamespace.to(game.id).emit("handOver", scores);
          game.passing = true;
          gameNamespace.to(game.id).emit("isPassing", {
            isPassing: true,
            direction: game.passDirection,
          });
        }
      }
    }
  });

  //check if currently in shooting choice
  socket.on("checkShooting", () => {
    game = getGameByID(socket.request.session.gameId);
    player = getPlayerOfGame(
      socket.request.session.playerId,
      socket.request.session.gameId
    );
    if (game && player) {
      if (game.moonShooter) {
        if (player === game.moonShooter) {
          socket.emit("shotTheMoon", { thisPlayer: true });
        } else {
          socket.emit("shotTheMoon", {
            thisPlayer: false,
            playerName: game.moonShooter.name,
          });
        }
      } else {
        socket.emit("notShooting");
      }
    }
  });

  //player disconnected
  socket.on("disconnect", () => {
    game = getGameByID(socket.request.session.gameId);
    player = getPlayerOfGame(
      socket.request.session.playerId,
      socket.request.session.gameId
    );
    if (game && player) {
      games.splice(games.indexOf(game), 1);
      gameNamespace.to(game.id).emit("gameDone");
    }
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log("server running on port " + PORT);
});
