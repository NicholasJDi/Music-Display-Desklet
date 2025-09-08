const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Settings = imports.ui.settings;

const DEFAULT_POLL_INTERVAL = 1; // seconds

function MyDesklet(metadata, instance_id) {
    this._init(metadata, instance_id);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata, instance_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, instance_id);
        this.metadata = metadata;

        const basePath = this.metadata.path + "/textures/";

        // Default values
        this.line1Format = "%title%";
        this.line2Format = "%artist%";
        this.line1Font = "";
        this.line2Font = "";
        this.line1Size = 20;
        this.line2Size = 17;
        this.hideSkipButtons = false;
        this.hideAllButtons = false;
        this.buttonTextSpacing = 7;
        this.buttonSize = 32;
        this.playerWhitelist = "rhythmbox,vlc";
        this.treatWhitelistAsBlacklist = false;
        this.pollInterval = DEFAULT_POLL_INTERVAL;

        this.btnPlayTexture = basePath + "play.png";
        this.btnPauseTexture = basePath + "pause.png";
        this.btnNextTexture = basePath + "next.png";
        this.btnPrevTexture = basePath + "previous.png";

        // Settings
        this.settings = new Settings.DeskletSettings(this, this.metadata.uuid, instance_id);

        // Line1
        this.settings.bind("line1_format", "line1Format", Lang.bind(this, this._updateAll));
        this.settings.bind("line1_font", "line1Font", Lang.bind(this, this._updateAll));
        this.settings.bind("line1_size", "line1Size", Lang.bind(this, this._updateAll));

        // Line2
        this.settings.bind("line2_format", "line2Format", Lang.bind(this, this._updateAll));
        this.settings.bind("line2_font", "line2Font", Lang.bind(this, this._updateAll));
        this.settings.bind("line2_size", "line2Size", Lang.bind(this, this._updateAll));

        // Buttons
        this.settings.bind("btn_play_texture", "btnPlayTexture", Lang.bind(this, this._updateAll));
        this.settings.bind("btn_pause_texture", "btnPauseTexture", Lang.bind(this, this._updateAll));
        this.settings.bind("btn_next_texture", "btnNextTexture", Lang.bind(this, this._updateAll));
        this.settings.bind("btn_prev_texture", "btnPrevTexture", Lang.bind(this, this._updateAll));
        this.settings.bind("hide_skip_buttons", "hideSkipButtons", Lang.bind(this, this._updateAll));
        this.settings.bind("hide_all_buttons", "hideAllButtons", Lang.bind(this, this._updateAll));
        this.settings.bind("button_text_spacing", "buttonTextSpacing", Lang.bind(this, this._updateAll));
        this.settings.bind("button_size", "buttonSize", Lang.bind(this, this._updateAll));

        // Player filter settings
        this.settings.bind("player_whitelist", "playerWhitelist", Lang.bind(this, this._updateAll));
        this.settings.bind("treat_whitelist_as_blacklist", "treatWhitelistAsBlacklist", Lang.bind(this, this._updateAll));

        // Poll interval setting
        this.settings.bind("poll_interval", "pollInterval", Lang.bind(this, this._resetPolling));

        // Layout
        this.mainBox = new St.BoxLayout({ vertical: false });
        this.setContent(this.mainBox);

        // Buttons VBox
        this.buttonVBox = new St.BoxLayout({ vertical: true });
        this.mainBox.add_child(this.buttonVBox);

        this.btnPlayPause = new St.Button();
        this.btnPlayPause.connect('button-press-event', Lang.bind(this, this._onPlayPausePressed));
        this.buttonVBox.add_child(this.btnPlayPause);

        this.skipHBox = new St.BoxLayout({ vertical: false });
        this.buttonVBox.add_child(this.skipHBox);

        this.btnPrev = new St.Button();
        this.btnPrev.connect('button-press-event', Lang.bind(this, this._onPrevPressed));
        this.skipHBox.add_child(this.btnPrev);

        this.btnNext = new St.Button();
        this.btnNext.connect('button-press-event', Lang.bind(this, this._onNextPressed));
        this.skipHBox.add_child(this.btnNext);

        // Dummy spacing widget between buttons and text
        this.spacingWidget = new St.Widget();
        this.mainBox.add_child(this.spacingWidget);

        // Text VBox
        this.textVBox = new St.BoxLayout({ vertical: true });
        this.mainBox.add_child(this.textVBox);

        this.labelTitle = new St.Label({ text: "Loading…" });
        this.textVBox.add_child(this.labelTitle);

        this.labelArtist = new St.Label({ text: "" });
        this.textVBox.add_child(this.labelArtist);

        // Update button sizes when textVBox allocation changes
        this.textVBox.connect('notify::allocation', Lang.bind(this, this._updateAll));

        // Initial UI update
        this._updateAll();

        // Polling for player updates
        this._startPolling();
    },

    _startPolling: function() {
        if (this._pollId) GLib.source_remove(this._pollId);
        this._pollId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            this.pollInterval,
            Lang.bind(this, this._updateStatus)
        );
    },

    _resetPolling: function() {
        this._startPolling();
    },

    _getPlayerctlArgs: function() {
        if (!this.playerWhitelist.trim()) return "";
        const players = this.playerWhitelist
            .split(",")
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .join(",");
        return this.treatWhitelistAsBlacklist
            ? `--ignore-player=${players}`
            : `--player=${players}`;
    },

    _runPlayerctl: function(args) {
        return GLib.spawn_command_line_sync(`playerctl ${this._getPlayerctlArgs()} ${args}`);
    },

    _updateAll: function() {
        this._updateText();
        this._updateFont();

        // Update spacing
        if (this.buttonVBox.visible) {
            this.spacingWidget.width = this.buttonTextSpacing;
            this.spacingWidget.height = 1;
            this.spacingWidget.show();
        } else {
            this.spacingWidget.hide();
        }

        // Update button sizes and textures
        let isPlaying = false;
        let [successStatus, outStatus] = this._runPlayerctl("status");
        let status = (successStatus && outStatus) ? outStatus.toString().trim() : null;
        if (status === "Playing") isPlaying = true;

        this._updateButtonTextures(isPlaying);
    },

    _updateFont: function() {
        this.labelTitle.style = `${this.line1Font ? "font-family:" + this.line1Font + ";" : ""} font-size: ${this.line1Size}px;`;
        this.labelArtist.style = `${this.line2Font ? "font-family:" + this.line2Font + ";" : ""} font-size: ${this.line2Size}px;`;
    },

    _updateText: function() {
        this._updateStatus();
    },

    _updateStatus: function() {
        let [successStatus, outStatus] = this._runPlayerctl("status");
        let status = (successStatus && outStatus) ? outStatus.toString().trim() : null;

        let showButtons = true;

        if (!status) {
            this.labelTitle.set_text("No player running");
            this.labelArtist.set_text("");
            showButtons = false;
        } else if (status === "Stopped") {
            this.labelTitle.set_text("Player is stopped");
            this.labelArtist.set_text("");
            showButtons = false;
        }

        // Update button visibility
        if (!showButtons || this.hideAllButtons) {
            this.buttonVBox.hide();
            this.spacingWidget.hide();
        } else {
            this.buttonVBox.show();
            if (this.hideSkipButtons) this.skipHBox.hide(); else this.skipHBox.show();
        }

        if (!status || status === "Stopped") return true;

        // Update metadata
        let [successTitle, outTitle] = this._runPlayerctl("metadata xesam:title");
        let title = (successTitle && outTitle) ? outTitle.toString().trim() : "Unknown Title";

        let [successArtist, outArtist] = this._runPlayerctl("metadata xesam:artist");
        let artist = (successArtist && outArtist) ? outArtist.toString().trim() : "Unknown Artist";

        let [successAlbum, outAlbum] = this._runPlayerctl("metadata xesam:album");
        let album = (successAlbum && outAlbum) ? outAlbum.toString().trim() : "Unknown Album";

        this.labelTitle.set_text(
            this.line1Format.replace("%title%", title)
                            .replace("%artist%", artist)
                            .replace("%album%", album)
        );
        this.labelArtist.set_text(
            this.line2Format.replace("%title%", title)
                            .replace("%artist%", artist)
                            .replace("%album%", album)
        );

        let isPlaying = (status === "Playing");
        this._updateButtonTextures(isPlaying);

        return true;
    },

    _updateButtonTextures: function(isPlaying) {
        const basePath = this.metadata.path + "/textures/";
        const playPauseSize = this.buttonSize;
        const skipSize = Math.floor(playPauseSize / 2);

        const playTexture = this.btnPlayTexture && this.btnPlayTexture !== "" ? this.btnPlayTexture : basePath + "play.png";
        const pauseTexture = this.btnPauseTexture && this.btnPauseTexture !== "" ? this.btnPauseTexture : basePath + "pause.png";
        const prevTexture = this.btnPrevTexture && this.btnPrevTexture !== "" ? this.btnPrevTexture : basePath + "previous.png";
        const nextTexture = this.btnNextTexture && this.btnNextTexture !== "" ? this.btnNextTexture : basePath + "next.png";

        let playPauseFile = isPlaying ? pauseTexture : playTexture;

        this.btnPlayPause.set_child(new St.Icon({
            gicon: Gio.icon_new_for_string(playPauseFile),
            icon_size: playPauseSize
        }));
        this.btnPlayPause.height = playPauseSize;

        if (!this.hideSkipButtons && !this.hideAllButtons) {
            this.btnPrev.set_child(new St.Icon({
                gicon: Gio.icon_new_for_string(prevTexture),
                icon_size: skipSize
            }));
            this.btnPrev.height = skipSize;

            this.btnNext.set_child(new St.Icon({
                gicon: Gio.icon_new_for_string(nextTexture),
                icon_size: skipSize
            }));
            this.btnNext.height = skipSize;
        }
    },

    _onPlayPausePressed: function() {
        GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgs()} play-pause`);
        this._updateAll();
    },

    _onPrevPressed: function() {
        GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgs()} previous`);
        this._updateAll();
    },

    _onNextPressed: function() {
        GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgs()} next`);
        this._updateAll();
    },

    on_desklet_removed: function() {
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = null;
        }
    }
};

function main(metadata, instance_id) {
    return new MyDesklet(metadata, instance_id);
}

