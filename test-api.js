const fetch = require('node-fetch');

const API = 'https://task-manager-backend-vcm9.onrender.com/api';

async function test() {
    const adId = Date.now();
    
    // Create user
    console.log('Signing up test user...');
    const userRes = await fetch(API + '/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'User Test', username: 'usertest' + adId, password: 'password' })
    });
    const user = await userRes.json();
    console.log('User token:', user.token?.substring(0, 10));
    
    console.log('Fetching user groups...');
    const groupsRes = await fetch(API + '/groups', {
        headers: { 'X-Session-Token': user.token }
    });
    const groupsText = await groupsRes.text();
    console.log('User Groups status:', groupsRes.status, groupsText);
}

test().catch(console.error);
