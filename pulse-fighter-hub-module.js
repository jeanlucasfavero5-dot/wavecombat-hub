/**
 * Pulse Fighter Hub - Server Module (v0.005)
 * Integrates WaveCombat server-side logic with the main Node.js/Socket.io Hub.
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client if environment variables are available
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

module.exports = function(io) {
    // In-memory state for matchmaking and active players
    const matchmakingQueue = [];
    const activePlayers = new Map(); // socket.id -> { username, verified, room }

    io.on('connection', (socket) => {
        console.log(`[PulseFighter] Player connected: ${socket.id}`);

        // Handle user authentication / registration in the hub
        socket.on('pulse-fighter:register', async (data) => {
            const { username, userId } = data || {};
            let isVerified = false;

            if (supabase && username) {
                try {
                    const { data: verData } = await supabase
                        .from('wavecombat_verificados')
                        .select('*')
                        .or(`username.eq.${username},user_id.eq.${userId}`)
                        .single();
                    
                    if (verData) {
                        isVerified = true;
                    }
                } catch (err) {
                    console.error('[PulseFighter] Error checking verification:', err.message);
                }
            }

            activePlayers.set(socket.id, { username: username || 'Lutador Anônimo', verified: isVerified, socketId: socket.id });
            
            // Broadcast updated online count / user list
            io.emit('pulse-fighter:online-users', Array.from(activePlayers.values()));
            socket.emit('pulse-fighter:registered-success', { verified: isVerified });
        });

        // Global Chat Event
        socket.on('pulse-fighter:global-chat', (messageData) => {
            const player = activePlayers.get(socket.id) || { username: 'Anônimo', verified: false };
            const payload = {
                username: player.username,
                verified: player.verified,
                message: messageData.message || '',
                timestamp: new Date().toISOString()
            };
            io.emit('pulse-fighter:global-chat-broadcast', payload);
        });

        // Matchmaking Queue Event
        socket.on('pulse-fighter:join-queue', (userData) => {
            const playerInfo = activePlayers.get(socket.id) || { socketId: socket.id, username: userData?.username || 'Lutador' };
            
            // Avoid duplicates in queue
            if (!matchmakingQueue.some(p => p.socketId === socket.id)) {
                matchmakingQueue.push(playerInfo);
            }

            io.emit('pulse-fighter:queue-update', { count: matchmakingQueue.length, max: 4 });

            // Check if we have enough players to start a match (e.g. 2 players for 1v1 duel)
            if (matchmakingQueue.length >= 2) {
                const p1 = matchmakingQueue.shift();
                const p2 = matchmakingQueue.shift();
                const roomName = `room_${Date.now()}_${Math.random().toString(36.substring(2, 7))}`;

                io.to(p1.socketId).emit('pulse-fighter:match-found', { room: roomName, opponent: p2.username });
                io.to(p2.socketId).emit('pulse-fighter:match-found', { room: roomName, opponent: p1.username });

                io.emit('pulse-fighter:queue-update', { count: matchmakingQueue.length, max: 4 });
            }
        });

        socket.on('pulse-fighter:leave-queue', () => {
            const index = matchmakingQueue.findIndex(p => p.socketId === socket.id);
            if (index !== -1) {
                matchmakingQueue.splice(index, 1);
                io.emit('pulse-fighter:queue-update', { count: matchmakingQueue.length, max: 4 });
            }
        });

        // Friend system helper events
        socket.on('pulse-fighter:friend-action', async (data) => {
            // Placeholder for Supabase integration regarding wavecombat_amigos
            socket.emit('pulse-fighter:friend-response', { status: 'success', data });
        });

        // Disconnection cleanup
        socket.on('disconnect', () => {
            activePlayers.delete(socket.id);
            const index = matchmakingQueue.findIndex(p => p.socketId === socket.id);
            if (index !== -1) {
                matchmakingQueue.splice(index, 1);
                io.emit('pulse-fighter:queue-update', { count: matchmakingQueue.length, max: 4 });
            }
            io.emit('pulse-fighter:online-users', Array.from(activePlayers.values()));
            console.log(`[PulseFighter] Player disconnected: ${socket.id}`);
        });
    });
};