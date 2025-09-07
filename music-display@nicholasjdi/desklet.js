const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;

const POLL_INTERVAL = 1; // seconds

function MyDesklet(metadata, instance_id) {
    this._init(metadata, instance_id);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata, instance_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, instance_id);

        // Vertical box to hold label + buttons
        this.box = new St.BoxLayout({ vertical: true });
        this.setContent(this.box);

        this.label = new St.Label({ text: "Initializing…" });
        this.box.add_child(this.label);

        // Horizontal box for buttons
        this.buttonBox = new St.BoxLayout({ vertical: false, style_class: 'desklet-button-box' });
        this.box.add_child(this.buttonBox);

        this._addButton("⏮️", "playerctl previous");
        this._addButton("⏯️", "playerctl play-pause");
        this._addButton("⏭️", "playerctl next");

        this._pollId = null;
        this._startPolling();
    },

    _addButton: function(label, command) {
        let btn = new St.Button({ label: label, style_class: 'desklet-button' });
        btn.connect('button-press-event', () => {
            GLib.spawn_command_line_async(command);
        });
        this.buttonBox.add_child(btn);
    },

    _startPolling: function() {
        this._pollId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            POLL_INTERVAL,
            Lang.bind(this, this._updateStatus)
        );
    },

    _updateStatus: function() {
        let [successStatus, outStatus] = GLib.spawn_command_line_sync('playerctl status');
        let status = (successStatus && outStatus) ? outStatus.toString().trim() : null;

        if (!status) {
            this.label.set_text("No player running.");
            return true;
        }

        let [successTitle, outTitle] = GLib.spawn_command_line_sync('playerctl metadata xesam:title');
        let title = (successTitle && outTitle) ? outTitle.toString().trim() : "Unknown Title";

        let [successArtist, outArtist] = GLib.spawn_command_line_sync('playerctl metadata xesam:artist');
        let artist = (successArtist && outArtist) ? outArtist.toString().trim() : "Unknown Artist";

        this.label.set_text(`[${status}] ${title} — ${artist}`);

        return true;
    },

    on_desklet_removed: function() {
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = null;
        }
    },
};

function main(metadata, instance_id) {
    return new MyDesklet(metadata, instance_id);
}

