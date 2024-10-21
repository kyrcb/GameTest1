const socket = io('http://localhost:3000');

let lobbyId;
let playerId;
let gameStarted = false;
let players = {}; // Object to store all players
const speed = 4;

// Animation frame settings
const FRAME_WIDTH = 54; // Width of each frame
const FRAME_HEIGHT = 96; // Height of each frame
const FRAME_COUNT = 4; // Number of frames per animation
const FRAME_SWITCH_INTERVAL = 500; // 0.5 seconds in milliseconds

// Load character sprites
const spriteSheets = {
    red: {
        up: loadImage('assets/L_UP.png'),
        down: loadImage('assets/L_DOWN.png'),
        left: loadImage('assets/L_LEFT.png'),
        right: loadImage('assets/L_RIGHT.png'),
    },
    blue: {
        up: loadImage('assets/L_UP.png'),
        down: loadImage('assets/L_DOWN.png'),
        left: loadImage('assets/L_LEFT.png'),
        right: loadImage('assets/L_RIGHT.png'),
    }
};

// Function to load an image
function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
}

// Function to get color based on player ID
function getColorById(id) {
    return (Object.keys(players).length % 2 === 0) ? 'red' : 'blue';
}

document.getElementById('joinLobbyButton').addEventListener('click', () => {
    lobbyId = document.getElementById('lobbyIdInput').value;
    if (lobbyId) {
        socket.emit('joinLobby', lobbyId);
    }
});

socket.on('startGame', (initialPlayers) => {
    if (!gameStarted) {
        gameStarted = true;
        players = initialPlayers;
        playerId = socket.id;
        
        // Initialize player direction and animation states
        for (let id in players) {
            players[id].direction = players[id].direction || 'down';
            players[id].frameIndex = 0;
            players[id].lastFrameTime = Date.now();
        }
        startGame();
    }
});

socket.on('lobbyUpdate', (playerList) => {
    const playerListElement = document.getElementById('playerList');
    playerListElement.innerHTML = '';
    playerList.forEach(player => {
        const listItem = document.createElement('li');
        listItem.textContent = `Player: ${player}`;
        playerListElement.appendChild(listItem);
    });
});

socket.on('updateEnemy', (enemyData) => {
    enemy.x = enemyData.x;
    enemy.y = enemyData.y;
    enemy.facingDirection = enemyData.facingDirection;
});

socket.on('playerMoved', (data) => {
    if (players[data.id]) {
        players[data.id].x = data.x;
        players[data.id].y = data.y;
        players[data.id].direction = data.direction;
    }
});


document.getElementById('readyButton').addEventListener('click', () => {
    if (lobbyId) {
        socket.emit('playerReady', lobbyId);
    }
});

function startGame() {
    document.getElementById('title').style.display = 'none'; // Hide the lobby form
    document.getElementById('lobby').style.display = 'none'; // Hide the lobby form
    setupGameCanvas();
    startGameLoop();
}

function setupGameCanvas() {
    const canvas = document.createElement('canvas');
    canvas.id = 'gameCanvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    // Handle window resize
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

// Smooth movement
let keys = {};

document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Move player
function movePlayer() {
    let direction = null;
    let moved = false;

    if (keys['ArrowUp']) {
        players[playerId].y -= speed;
        direction = 'up';
        moved = true;
    } else if (keys['ArrowDown']) {
        players[playerId].y += speed;
        direction = 'down';
        moved = true;
    } else if (keys['ArrowLeft']) {
        players[playerId].x -= speed;
        direction = 'left';
        moved = true;
    } else if (keys['ArrowRight']) {
        players[playerId].x += speed;
        direction = 'right';
        moved = true;
    }

    players[playerId].x = Math.max(0, Math.min(players[playerId].x, window.innerWidth - FRAME_WIDTH));
    players[playerId].y = Math.max(0, Math.min(players[playerId].y, window.innerHeight - FRAME_HEIGHT));

    if (moved) {
        players[playerId].direction = direction;

        // Emit new position to the server
        socket.emit('move', {
            id: playerId,
            x: players[playerId].x,
            y: players[playerId].y,
            direction,
            lobbyId
        });
    } 
}

function drawPlayer(player, ctx) {
    const spriteSheet = spriteSheets[player.color][player.direction];
    const sourceX = player.frameIndex * FRAME_WIDTH;
    const sourceY = 0;

    ctx.drawImage(
        spriteSheet,
        sourceX, sourceY, FRAME_WIDTH, FRAME_HEIGHT,
        player.x, player.y, FRAME_WIDTH, FRAME_HEIGHT
    );
}

// Enemy and Bullets Management
const enemyImages = {
    left: new Image(),
    right: new Image(),
    front: new Image(),
    back: new Image(),
};

const bullets = [];
const bulletSpeed = 10;

const bulletImage = new Image();
bulletImage.src = './assets/Math_projectile.png'; // Replace with the actual path

enemyImages.left.src = './AI Design/AI_Side_pov_Left-Sheet.png'; // Replace with actual path
enemyImages.right.src = './AI Design/AI_Side_pov_right.png'; // Replace with actual path
enemyImages.front.src = './AI Design/AI_front_pov.png'; // Replace with actual path
enemyImages.back.src = './AI Design/AI_Back_pov.png'; // Replace with actual path

const enemy = {
    x: 1200,
    y: 220,
    radius: 50,
    speed: 1, // Adjusted for smoother targeting
    facingDirection: 'left' // Default facing direction
};

// Function to find the nearest player
function findNearestPlayer() {
    let nearestPlayer = null;
    let minDistance = Infinity;

    for (const id in players) {
        const player = players[id];
        const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);

        if (distance < minDistance) {
            minDistance = distance;
            nearestPlayer = player;
        }
    }

    return nearestPlayer;
}

// Update enemy's position and bullets
function updateEnemy() {
    const targetPlayer = findNearestPlayer();

    if (targetPlayer) {
        // Move enemy towards player
        const angle = Math.atan2(targetPlayer.y - enemy.y, targetPlayer.x - enemy.x);
        enemy.x += enemy.speed * Math.cos(angle);
        enemy.y += enemy.speed * Math.sin(angle);

        // Update facing direction
        updateEnemyDirection(targetPlayer);

        // Generate bullets from enemy
        if (Math.random() < 0.02) { // Shooting interval
            const bullet = {
                x: enemy.x,
                y: enemy.y,
                angle: angle
            };
            bullets.push(bullet);
        }
    }
}

// Draw the enemy
function drawEnemy(ctx) {
    const currentEnemyImage = enemyImages[enemy.facingDirection];
    ctx.drawImage(currentEnemyImage, enemy.x - enemy.radius, enemy.y - enemy.radius, enemy.radius * 2, enemy.radius * 2);
}

// Update bullets
function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.x += bulletSpeed * Math.cos(bullet.angle);
        bullet.y += bulletSpeed * Math.sin(bullet.angle);

        // Check for collision with players
        for (const id in players) {
            if (isColliding(players[id], bullet)) {
                // Handle collision (e.g., damage player, etc.)
                bullets.splice(i, 1); // Remove bullet after collision
                break;
            }
        }

        // Remove bullet if it goes off canvas
        if (bullet.x < 0 || bullet.x > window.innerWidth || bullet.y < 0 || bullet.y > window.innerHeight) {
            bullets.splice(i, 1);
        }
    }
}

// Check for collision between player and bullet
function isColliding(player, bullet) {
    const playerRadius = 25; // Assuming player radius for collision detection
    const bulletRadius = 25; // Assuming bullet radius for collision detection
    const dx = bullet.x - player.x;
    const dy = bullet.y - player.y;
    const distance = Math.hypot(dx, dy);
    return distance < playerRadius + bulletRadius;
}

// Draw bullets
function drawBullets(ctx) {
    for (const bullet of bullets) {
        ctx.drawImage(bulletImage, bullet.x - 25, bullet.y - 60, 50, 80); // Adjust as necessary
    }
}

// Update enemy direction based on nearest player
function updateEnemyDirection(targetPlayer) {
    const dx = targetPlayer.x - enemy.x;
    const dy = targetPlayer.y - enemy.y;
    const angle = Math.atan2(dy, dx); // Get angle between enemy and player

    // Determine the direction based on angle
    if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
        enemy.facingDirection = 'right'; // Facing right
    } else if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) {
        enemy.facingDirection = 'front'; // Facing down
    } else if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) {
        enemy.facingDirection = 'back'; // Facing up
    } else {
        enemy.facingDirection = 'left'; // Facing left
    }
}

// Main game loop
function startGameLoop() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const img = document.getElementById("bg");
    const pat = ctx.createPattern(img, "repeat");

    function gameLoop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        console.log("Game loop is running");
        movePlayer(); // Handle player movement
        updateEnemy(); // Update enemy's position and bullets
        updateBullets(); // Update bullets

        // Draw players
        for (const id in players) {
            drawPlayer(players[id], ctx);
        }

        // Draw the enemy
        drawEnemy(ctx);

        // Draw bullets
        drawBullets(ctx);

        requestAnimationFrame(gameLoop); // Request next animation frame
    }

    requestAnimationFrame(gameLoop); // Start the game loop
}

// Handle socket events for player positions
socket.on('updatePlayers', (updatedPlayers) => {
    players = updatedPlayers;
});

// Handle game disconnect
socket.on('disconnect', () => {
    console.log('You have been disconnected from the server.');
});

// Start the initial game setup when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.createElement('canvas');
    canvas.id = 'gameCanvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    
    // Setup event listeners
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
});
