#!/usr/bin/env node
const fs = require('fs');
const http = require('http');

function welcome() {
    console.log("I am Croot - tiny CRUD HTTP server.");
    console.log("Usage: croot serve [<dir>|<json file>]");
    console.log("Example: croot serve data.json");
    process.exit(0);
}

function serve_not_exist_json(path_for_save_json, port) {
    const server = http.createServer((req, res) => {
        res.statusCode = 200;
        res.end("I am Croot");
    })
    server.listen(port, function() {
        console.log("listening http://localhost:" + server.address().port);
    });
}

function serve(args, port) {
    const path = args[0];
    if (fs.existsSync(path)) {
        const stat = fs.lstatSync(path);
        if (stat.isDirectory()) {
            serve_dir(path);
        } else {
            const content = fs.readFileSync(path, "UTF-8");
            try {
                const json = JSON.parse(content);
                serve_json(json);
            } catch(e) {
                console.error("serve_json error", e);
                process.exit(1);
            }
        }
    } else {
        const path_for_save_json = path;
        serve_not_exist_json(path_for_save_json, port);
    }
}

function get_command_args(command_name, process_argv) {
    return process_argv.slice(3);
}

function main(process_argv) {
    const current_command = process_argv[2];
    const port = process.env.PORT || 3300;
    const command_name_list = {
        serve_command: { 
            name: 'serve', description: "serve directory or json file over http" 
        }
    };

    if (!current_command)
        welcome();

    if (current_command == command_name_list.serve_command.name) {
        const serve_command_args = get_command_args(
            command_name_list.serve_command.name, process_argv);
        serve(serve_command_args, port);
    }
}

main(process.argv);
