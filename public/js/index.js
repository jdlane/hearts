const socket = io();

document.getElementById("find-field").addEventListener("submit", (event) => {
  event.preventDefault();
  let name = document.getElementById("name-field").value;
  let jodEle = document.getElementById("jod-field");
  let to100Ele = document.getElementById("to-100");
  let jod = null;
  let to100 = null;
  if (document.getElementById("game-choices")) {
    jod = jodEle.checked;
    to100 = to100Ele.checked;
    socket.emit("waiting", { name: name, jod: jod, to100: to100 });
  } else {
    socket.emit("waiting", { name: name });
  }
  document.getElementById("find-field").style.display = "none";
});

socket.on("firstPlayerJoined", (rules) => {
  document.getElementById("game-rules").style.display = "inline";
  let choices = document.getElementById("game-choices");
  if (choices) {
    choices.style.display = "none";
    document.getElementById("game-rules").innerHTML = `${
      rules.jod ? "<li>Jack of Diamonds -10</li>" : ""
    }<li>Playing to ${rules.maxScore}</li>`;
  }
});

socket.on("waitlistEmpty", () => {
  let choices = document.getElementById("game-choices");
  document.getElementById("game-rules").style.display = "none";
  if (choices) {
    choices.style.display = "inline";
  } else {
    document.getElementById("choices-div").innerHTML =
      '<div id="game - choices"></div>< div ><label for="jod-field">Play with Jack of Diamonds</label><input type="checkbox" id="jod-field" checked /></div ><div><label for="to-100">Play to 100</label><input type="radio" name="max-score" id="to-100" checked /><label for="to-50">Play to 50</label><input type="radio" name="max-score" id="to-50" /></div></div>';
  }
});

socket.on("startGame", (game) => {
  window.location.href = "/game?gid=" + game.id;
});

socket.on("err", (msg) => {
  document.getElementById("status").innerHTML = msg;
});

socket.on("queued", (name) => {
  document.getElementById("name-tag").innerHTML = name;
  document.getElementById("status").innerHTML = "waiting...";
});

socket.on("playerJoined", (number) => {
  document.getElementById("player-count").innerHTML =
    4 - number + " players needed";
});

socket.on("findFailed", () => {
  location.reload();
});
