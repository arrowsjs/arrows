var hits = 0;

function setup() {
    hits = 0;
}

function hit() {
    hits++;
}

function showAll() {
    $('.hole').flip(true);
}

function hideAll() {
    $('.hole').flip({
        trigger: 'manual'
    });
}

function randomTimeout() {
    return Math.random() * 5000 + 2500;
}

function won() {
    alert('You won!');
}

function lost() {
    alert('You lost!');
}
