const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Settings = imports.ui.settings;

const DEFAULT_POLL_INTERVAL = 1;

function MyDesklet(metadata, instance_id) {
    this._init(metadata, instance_id);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata, instance_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, instance_id);
        this.metadata = metadata;
        const basePath = this.metadata.path + "/textures/";

        // Defaults
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

        // Bind settings
        this._bindSettings();

        // Layout
        this.mainBox = new St.BoxLayout({ vertical: false });
        this.setContent(this.mainBox);

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

        // Dummy spacing widget
        this.spacingWidget = new St.Widget({ style_class: "spacing-widget", width: this.buttonTextSpacing });
        this.mainBox.add_child(this.spacingWidget);

        this.textVBox = new St.BoxLayout({ vertical: true });
        this.mainBox.add_child(this.textVBox);

        this.labelTitle = new St.Label({ text: "Loading…" });
        this.textVBox.add_child(this.labelTitle);

        this.labelArtist = new St.Label({ text: "" });
        this.textVBox.add_child(this.labelArtist);

        this.textVBox.connect('notify::allocation', Lang.bind(this, this._updateAll));

        this._updateAll();
        this._startPolling();
    },

    _bindSettings: function() {
        const settings = this.settings;
        const bind = Lang.bind;

        settings.bind("line1_format", "line1Format", bind(this, this._updateAll));
        settings.bind("line1_font", "line1Font", bind(this, this._updateAll));
        settings.bind("line1_size", "line1Size", bind(this, this._updateAll));
        settings.bind("line2_format", "line2Format", bind(this, this._updateAll));
        settings.bind("line2_font", "line2Font", bind(this, this._updateAll));
        settings.bind("line2_size", "line2Size", bind(this, this._updateAll));

        settings.bind("btn_play_texture", "btnPlayTexture", bind(this, this._updateAll));
        settings.bind("btn_pause_texture", "btnPauseTexture", bind(this, this._updateAll));
        settings.bind("btn_next_texture", "btnNextTexture", bind(this, this._updateAll));
        settings.bind("btn_prev_texture", "btnPrevTexture", bind(this, this._updateAll));
        settings.bind("hide_skip_buttons", "hideSkipButtons", bind(this, this._updateAll));
        settings.bind("hide_all_buttons", "hideAllButtons", bind(this, this._updateAll));
        settings.bind("button_text_spacing", "buttonTextSpacing", bind(this, this._updateAll));
        settings.bind("button_size", "buttonSize", bind(this, this._updateAll));

        settings.bind("player_whitelist", "playerWhitelist", bind(this, this._updateAll));
        settings.bind("treat_whitelist_as_blacklist", "treatWhitelistAsBlacklist", bind(this, this._updateAll));

        settings.bind("poll_interval", "pollInterval", bind(this, this._resetPolling));
    },

    _startPolling: function() {
        if (this._pollId) GLib.source_remove(this._pollId);
        this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.pollInterval, Lang.bind(this, this._updateStatus));
    },

    _resetPolling: function() {
        this._startPolling();
    },

    _getPlayerctlArgs: function() {
        if (!this.playerWhitelist.trim()) return "";
        const players = this.playerWhitelist.split(",").map(p => p.trim()).filter(p => p.length > 0).join(",");
        return this.treatWhitelistAsBlacklist ? `--ignore-player=${players}` : `--player=${players}`;
    },

    _runPlayerctl: function(args) {
        return GLib.spawn_command_line_sync(`playerctl ${this._getPlayerctlArgs()} ${args}`);
    },

    _fetchPerPlayerMetadata: function(tag) {
        const regex = /%\[([\w-]+)\]\s+([^%]+)%/g;
        return tag.replace(regex, (match, player, meta) => {
            let [success, out] = GLib.spawn_command_line_sync(`playerctl --player=${player} metadata ${meta}`);
            return (success && out) ? out.toString().trim() : "";
        });
    },

    _replaceDynamicTags: function(str, title, artist, album) {
        str = str.replace(/%title%/g, title).replace(/%artist%/g, artist).replace(/%album%/g, album);
        return this._fetchPerPlayerMetadata(str);
    },

    _updateAll: function() {
        this._updateFont();
        this._updateStatus();
        this.spacingWidget.width = this.buttonTextSpacing;
    },

    _updateFont: function() {
        this.labelTitle.style = `${this.line1Font ? "font-family:" + this.line1Font + ";" : ""} font-size: ${this.line1Size}px;`;
        this.labelArtist.style = `${this.line2Font ? "font-family:" + this.line2Font + ";" : ""} font-size: ${this.line2Size}px;`;
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

        if (!showButtons || this.hideAllButtons) {
            this.buttonVBox.hide();
            this.spacingWidget.hide();
        } else {
            this.buttonVBox.show();
            this.spacingWidget.show();
            if (this.hideSkipButtons) this.skipHBox.hide(); else this.skipHBox.show();
        }

        if (!status || status === "Stopped") return true;

        let [successTitle, outTitle] = this._runPlayerctl("metadata xesam:title");
        let title = (successTitle && outTitle) ? outTitle.toString().trim() : "Unknown Title";

        let [successArtist, outArtist] = this._runPlayerctl("metadata xesam:artist");
        let artist = (successArtist && outArtist) ? outArtist.toString().trim() : "Unknown Artist";

        let [successAlbum, outAlbum] = this._runPlayerctl("metadata xesam:album");
        let album = (successAlbum && outAlbum) ? outAlbum.toString().trim() : "Unknown Album";

        this.labelTitle.set_text(this._replaceDynamicTags(this.line1Format, title, artist, album));
        this.labelArtist.set_text(this._replaceDynamicTags(this.line2Format, title, artist, album));

        let isPlaying = (status === "Playing");
        this._updateButtonTextures(isPlaying);

        return true;
    },

    _updateButtonTextures: function(isPlaying) {
        const basePath = this.metadata.path + "/textures/";
        const playTexture = (this.btnPlayTexture && this.btnPlayTexture !== "") ? this.btnPlayTexture : basePath + "play.png";
        const pauseTexture = (this.btnPauseTexture && this.btnPauseTexture !== "") ? this.btnPauseTexture : basePath + "pause.png";
        const prevTexture = (this.btnPrevTexture && this.btnPrevTexture !== "") ? this.btnPrevTexture : basePath + "previous.png";
        const nextTexture = (this.btnNextTexture && this.btnNextTexture !== "") ? this.btnNextTexture : basePath + "next.png";

        let playPauseFile = isPlaying ? pauseTexture : playTexture;

        this.btnPlayPause.set_child(new St.Icon({ gicon: Gio.icon_new_for_string(playPauseFile), icon_size: this.buttonSize }));
        this.btnPlayPause.height = this.buttonSize;

        if (!this.hideSkipButtons && !this.hideAllButtons) {
            let skipSize = Math.floor(this.buttonSize / 2);
            this.btnPrev.set_child(new St.Icon({ gicon: Gio.icon_new_for_string(prevTexture), icon_size: skipSize }));
            this.btnPrev.height = skipSize;
            this.btnNext.set_child(new St.Icon({ gicon: Gio.icon_new_for_string(nextTexture), icon_size: skipSize }));
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

