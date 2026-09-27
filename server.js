const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    res.end("Space Raiders multiplayer server is online!");
});

const wss = new WebSocket.Server({
    server
});

let nextPlayerId = 1;

const players = new Map();

function send(socket, data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function broadcast(data, except = null) {
    for (const player of players.values()) {
        if (player.socket !== except) {
            send(player.socket, data);
        }
    }
}

wss.on("connection", (socket) => {
    if (players.size >= 2) {
        send(socket, {
            type: "error",
            message: "Game is full."
        });

        socket.close();
        return;
    }

    const id = nextPlayerId++;

    const player = {
        id,
        socket,
        x: id === 1 ? 250 : 750,
        y: 400,
        hp: 100
    };

    players.set(id, player);

    console.log(`Player ${id} joined.`);

    send(socket, {
        type: "welcome",
        playerId: id,
        players: [...players.values()].map(p => ({
            id: p.id,
            x: p.x,
            y: p.y,
            hp: p.hp
        }))
    });

    broadcast({
        type: "playerJoined",
        player: {
            id: player.id,
            x: player.x,
            y: player.y,
            hp: player.hp
        }
    }, socket);

    socket.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);

            if (data.type === "state") {
                player.x = Number(data.x) || player.x;
                player.y = Number(data.y) || player.y;

                broadcast({
                    type: "playerState",
                    id: player.id,
                    x: player.x,
                    y: player.y,
                    hp: player.hp
                }, socket);
            }

            if (data.type === "shoot") {
                broadcast({
                    type: "playerShoot",
                    id: player.id,
                    x: player.x,
                    y: player.y,
                    angle: Number(data.angle) || 0
                }, socket);
            }

            if (data.type === "hit") {
                const target = players.get(Number(data.targetId));

                if (!target) return;

                const damage = Math.max(
                    1,
                    Math.min(50, Number(data.damage) || 10)
                );

                target.hp = Math.max(0, target.hp - damage);

                broadcast({
                    type: "playerHit",
                    id: target.id,
                    hp: target.hp
                });

                if (target.hp <= 0) {
                    broadcast({
                        type: "playerDefeated",
                        id: target.id
                    });
                }
            }

        } catch (error) {
            console.log("Invalid message received.");
        }
    });

    socket.on("close", () => {
        players.delete(id);

        console.log(`Player ${id} left.`);

        broadcast({
            type: "playerLeft",
            id
        });
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Space Raiders server running on port ${PORT}`);
});
