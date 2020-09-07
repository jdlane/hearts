const socket = io("/game");

var passing = false;
var passLocked = false;
var selectedCards = [];

document.addEventListener("DOMContentLoaded", () => {
  //confirm joined game
  socket.emit("joined");

  document.querySelectorAll(".card-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      let cardInfo = btn.id.split("-");
      let cardIndex = parseInt(cardInfo[cardInfo.length - 1]);
      let card = btn.querySelector(".card-text").innerHTML.trim();
      if (passing) {
        if (!passLocked) {
          let findCard = selectedCards.find((c) => {
            return c.card === card;
          });
          if (findCard) {
            selectedCards.splice(selectedCards.indexOf(findCard), 1);
            btn.style.boxShadow = "";
          } else if (selectedCards.length < 3) {
            selectedCards.push({ card: card, index: cardIndex });
            btn.style.boxShadow = "0px 0px 10px 4px blue";
          } else {
            document.getElementById("error").innerHTML =
              "You can only pass 3 cards. Click a card to deselect it";
          }
        }
      } else {
        socket.emit("playCard", {
          card: card,
          index: cardIndex,
        });
      }
    });
  });
  document.getElementById("pass-btn").addEventListener("click", () => {
    if (selectedCards.length === 3) {
      socket.emit("passCards", selectedCards);
      passLocked = true;
    } else {
      document.getElementById("error").innerHTML = "You must pass 3 cards";
    }
  });

  document.getElementById("moon-0-btn").addEventListener("click", () => {
    socket.emit("moonChoice", 0);
  });
  document.getElementById("moon-1-btn").addEventListener("click", () => {
    socket.emit("moonChoice", 1);
  });

  socket.emit("checkPassing");
  socket.emit("checkShooting");
});

socket.on("passingOver", () => {
  passLocked = false;
  socket.emit("requestHand");
  document.getElementById("error").innerHTML = "";
});

socket.on("passFailed", (msg) => {
  passLocked = false;
  document.getElementById("error").innerHTML = msg;
});

socket.on("passSuccessful", (passedCards) => {
  document.getElementById("pass-div").style.display = "none";
  for (let i = 0; i < 3; i++) {
    document.getElementById("play-card-" + passedCards[i].index).style.display =
      "none";
  }
  document.getElementById("error").innerHTML =
    "Waiting for all players to pass...";
});

socket.on("turnSuccessful", (card) => {
  document.getElementById("play-card-" + card.index).style.display = "none";
  document.getElementById("error").innerHTML = "";
});

socket.on("turnFailed", (msg) => {
  document.getElementById("error").innerHTML = msg;
});

socket.on("alreadyPassed", () => {
  document.getElementById("error").innerHTML = "already passed";
  for (let i = 0; i < 13; i++) {
    let card = document.getElementById("play-card-" + i);
    card.style.boxShadow = "";
  }
  selectedCards = [];
  document.getElementById("pass-div").style.display = "none";
});

socket.on("cardPlayed", (data) => {
  document.getElementById("real-card-" + data.playerIndex).innerHTML =
    data.card;
  document.getElementById(
    "table-img-" + data.playerIndex
  ).src = `/cards/${data.card}.png`;
});

socket.on("newTurn", (playerIndex) => {
  document.getElementById("real-player-" + playerIndex).style.backgroundColor =
    "yellow";
  document.getElementById(
    "real-player-" + ((playerIndex + 3) % 4)
  ).style.backgroundColor = "white";
});

socket.on("newTrick", (index) => {
  for (let i = 0; i < 4; i++) {
    document.getElementById("real-player-" + i).style.backgroundColor =
      index === i ? "yellow" : "white";
    document.getElementById("real-card-" + i).innerHTML = "__";
    document.getElementById("table-img-" + i).src = "/cards/blank.png";
  }
});

socket.on("handOver", (scores) => {
  for (let i = 0; i < 4; i++) {
    document.getElementById("score-" + i).innerHTML = scores[i];
  }
  document.getElementById("shot-moon-div").style.display = "none";
  socket.emit("requestHand");
});

socket.on("newHand", (hand) => {
  for (let i = 0; i < hand.length; i++) {
    let card = document.getElementById("play-card-" + i);
    card.style.display = "inline";
    card.style.boxShadow = "";
    document.getElementById("card-data-" + i).innerHTML = hand[i];
    card.querySelector("img").src = `/cards/${hand[i]}.png`;
  }
});

socket.on("trickDone", () => {
  setTimeout(() => {
    socket.emit("seenTrick");
  }, 2000);
});

socket.on("isPassing", (data) => {
  passing = data.isPassing;
  if (!data.isPassing) {
    document.getElementById("pass-div").style.display = "none";
    document.getElementById("moon-shot-div").style.display = "none";
  } else {
    selectedCards = [];
    document.getElementById("pass-div").style.display = "inline";
    document.getElementById("pass-direction").innerHTML = data.direction;
    document.getElementById("error").innerHTML =
      "Click to cards to select them";
  }
});

socket.on("moonShot", () => {
  socket.emit("moonShotRequest");
});

socket.on("gameOver", (data) => {
  for (let i = 0; i < 4; i++) {
    document.getElementById("score-" + i).innerHTML = data.scores[i];
  }
  document.getElementById("shot-moon-div").style.display = "none";

  if (data.winner === document.getElementById("my-name")) {
    document.getElementById("error").innerHTML = `You win!`;
  } else {
    document.getElementById("error").innerHTML = `${data.winner} wins!`;
  }
});

socket.on("shotTheMoon", (data) => {
  if (data.thisPlayer) {
    document.getElementById("shot-moon-div").style.display = "inline";
    document.getElementById("error").innerHTML = "You shot the moon!";
  } else {
    document.getElementById("shot-moon-div").style.display = "none";
    document.getElementById(
      "error"
    ).innerHTML = `${data.playerName} shot the moon!`;
  }
});

socket.on("notShooting", () => {
  document.getElementById("shot-moon-div").style.display = "none";
});

socket.on("moonFailed", (msg) => {
  document.getElementById("error").innerHTML = msg;
});

socket.on("gameDone", () => {
  window.location.href = "/";
});
