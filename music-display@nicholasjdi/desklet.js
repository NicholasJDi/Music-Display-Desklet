const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Lang = imports.lang;
const GLib = imports.gi.GLib;

const POLL_INTERVAL = 1; // seconds

function MyDesklet(metadata, instance_id) {
    this._init(metadata, instance_id);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata, instance_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, instance_id);

        // Main vertical box
        this.mainBox = new St.BoxLayout({ vertical: true });
        this.setContent(this.mainBox);

        // Row 1: Play/Pause + Title
        this.row1 = new St.BoxLayout({ vertical: false });
        this.mainBox.add_child(this.row1);

        this.btnPlayPause = new St.Button({ label: "⏯️" });
        this.btnPlayPause.connect('button-press-event', () => {
            GLib.spawn_command_line_async('playerctl play-pause');
        });
        this.row1.add_child(this.btnPlayPause);

        this.labelTitle = new St.Label({ text: "Loading…" });
        this.labelTitle.set_x_expand(true);
        this.row1.add_child(this.labelTitle);

        // Row 2: Previous, Next + Artist
        this.row2 = new St.BoxLayout({ vertical: false });
        this.mainBox.add_child(this.row2);

        this.btnPrev = new St.Button({ label: "⏮️" });
        this.btnPrev.connect('button-press-event', () => {
            GLib.spawn_command_line_async('playerctl previous');
        });
        this.row2.add_child(this.btnPrev);

        this.btnNext = new St.Button({ label: "⏭️" });
        this.btnNext.connect('button-press-event', () => {
            GLib.spawn_command_line_async('playerctl next');
        });
        this.row2.add_child(this.btnNext);

        this.labelArtist = new St.Label({ text: "" });
        this.labelArtist.set_x_expand(true);
        this.row2.add_child(this.labelArtist);

        // Start polling for playback updates
        this._pollId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            POLL_INTERVAL,
            Lang.bind(this, this._updateStatus)
        );
    },

    _updateStatus: function() {
        // Playback status
        let [successStatus, outStatus] = GLib.spawn_command_line_sync('playerctl status');
        let status = (successStatus && outStatus) ? outStatus.toString().trim() : null;

        if (!status) {
            this.labelTitle.set_text("No player running");
            this.labelArtist.set_text("");
            return true;
        }

        // Title
        let [successTitle, outTitle] = GLib.spawn_command_line_sync('playerctl metadata xesam:title');
        let title = (successTitle && outTitle) ? outTitle.toString().trim() : "Unknown Title";

        // Artist
        let [successArtist, outArtist] = GLib.spawn_command_line_sync('playerctl metadata xesam:artist');
        let artist = (successArtist && outArtist) ? outArtist.toString().trim() : "Unknown Artist";

        this.labelTitle.set_text(title);
        this.labelArtist.set_text(artist);

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

