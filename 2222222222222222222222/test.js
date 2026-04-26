const io = require('socket.io-client');
const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Connected');
    socket.emit('admin_join_room', { roomId: 'TEST' });
});

socket.on('game_state', (data) => {
    console.log('game_state received, mapOrder:', !!data.mapOrder);
});

socket.on('map_update', (data) => {
    console.log('map_update received length:', data.length);
    process.exit(0);
});

setTimeout(() => {
    console.log('Timeout');
    process.exit(1);
}, 5000);
