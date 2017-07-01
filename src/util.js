function getLocation(stack) {
    let r = new RegExp(/(?:https?|file):\/\/(.+):(\d+):\d+/g);

    for (let match of stack.match(r)) {
        let parts = new RegExp(/(?:https?|file):\/\/(.+):(\d+):\d+/g).exec(match);

        if (!parts[1].endsWith('arrows.js')) {
            return parts[1] + ':' + parts[2];
        }
    }

    return '';
}
