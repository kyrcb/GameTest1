const http = require('http');
const path = require('path');
const express = require('express');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const lobbies = {};
const players = {}; // Store player positions

let enemy = {
    x: 1200,
    y: 220,
    radius: 50,
    speed: 10,
    direction: Math.random() * Math.PI * 2,
    facingDirection: 'left' // Default facing direction
};

io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    socket.on('joinLobby', (lobbyId) => {
        console.log(`Player ${socket.id} trying to join lobby ${lobbyId}`);
        if (!lobbies[lobbyId]) {
            lobbies[lobbyId] = {
                players: [],
                playersReady: [],
                gameStarted: false
            };
        }
    
        if (lobbies[lobbyId].gameStarted) {
            socket.emit('error', 'Game has already started');
            return;
        }
    
        lobbies[lobbyId].players.push(socket.id);
    
        // Alternate player colors
        const color = (Object.keys(players).length % 2 === 0) ? 'red' : 'blue';
        players[socket.id] = { id: socket.id, color: color, x: 100, y: 100, direction: 'down' };
    
        socket.join(lobbyId);
        console.log(`Player ${socket.id} joined lobby ${lobbyId}`);
        
        // Notify lobby update and send initial positions
        io.to(lobbyId).emit('lobbyUpdate', lobbies[lobbyId].players);
        io.to(lobbyId).emit('updatePositions', players);
    });    

    socket.on('playerReady', (lobbyId) => {
        if (lobbies[lobbyId]) {
            lobbies[lobbyId].playersReady.push(socket.id);

            // Start the game when all players are ready
            if (lobbies[lobbyId].players.length === lobbies[lobbyId].playersReady.length) {
                lobbies[lobbyId].gameStarted = true;

                // Initialize players with colors and positions
                lobbies[lobbyId].players.forEach((playerId, index) => {
                    players[playerId] = { 
                        id: playerId,
                        x: index * 200 + 100, // Position players based on index
                        y: 100, 
                        color: index === 0 ? 'red' : 'blue',
                        direction: 'down' // Default direction
                    };
                });

                // Notify all players that the game is starting and send initial positions
                io.to(lobbyId).emit('startGame', players);
            }
        }
    });

    socket.on('move', (data) => {
        if (players[data.id]) {
            // Update the server's record of the player's position
            players[data.id].x = data.x;
            players[data.id].y = data.y;
            players[data.id].direction = data.direction;
    
            // Broadcast to all players in the same lobby
            const playerLobby = Object.keys(lobbies).find(lobbyId => lobbies[lobbyId].players.includes(data.id));
            if (playerLobby) {
                io.to(playerLobby).emit('playerMoved', {
                    id: data.id,
                    x: data.x,
                    y: data.y,
                    direction: data.direction
                });
            }
        }
    }); 
    

    socket.on('disconnect', () => {
        const playerLobby = Object.keys(lobbies).find(lobbyId => lobbies[lobbyId].players.includes(socket.id));
        if (playerLobby) {
            lobbies[playerLobby].players = lobbies[playerLobby].players.filter(id => id !== socket.id);
            delete players[socket.id];
            console.log(`Player ${socket.id} disconnected from lobby ${playerLobby}`);

            // Update other players in the lobby
            io.to(playerLobby).emit('lobbyUpdate', lobbies[playerLobby].players);
            io.to(playerLobby).emit('updatePositions', players);
        }
    });
});

// Function to update enemy's movement and broadcast
function updateEnemyPosition() {
    // Find the nearest player to the enemy
    let nearestPlayer = null;
    let minDistance = Infinity;

    Object.values(players).forEach(player => {
        const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (distance < minDistance) {
            minDistance = distance;
            nearestPlayer = player;
        }
    });

    if (nearestPlayer) {
        const angle = Math.atan2(nearestPlayer.y - enemy.y, nearestPlayer.x - enemy.x);
        enemy.x += enemy.speed * Math.cos(angle);
        enemy.y += enemy.speed * Math.sin(angle);

        // Update the direction based on angle
        if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
            enemy.facingDirection = 'right';
        } else if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) {
            enemy.facingDirection = 'front';
        } else if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) {
            enemy.facingDirection = 'back';
        } else {
            enemy.facingDirection = 'left';
        }

        // Broadcast enemy position and facing direction to all players
        io.emit('updateEnemy', {
            x: enemy.x,
            y: enemy.y,
            facingDirection: enemy.facingDirection
        });
    }
}

// Call this function every 100ms to update the enemy
setInterval(updateEnemyPosition, 100);


// Start the server
server.listen(3000, () => {
    console.log('Server is listening on port 3000');
});
