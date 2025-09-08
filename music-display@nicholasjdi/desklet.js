const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Settings = imports.ui.settings;

const DEFAULT_POLL_INTERVAL = 1;
const DEFAULT_IDLE_POLL_INTERVAL = 3;

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
        this.idlePollInterval = DEFAULT_IDLE_POLL_INTERVAL;

        this.btnPlayTexture = basePath + "play.png";
        this.btnPauseTexture = basePath + "pause.png";
        this.btnNextTexture = basePath + "next.png";
        this.btnPrevTexture = basePath + "previous.png";

        // Track last displayed info to minimize UI churn
        this._lastStatus = null;
        this._lastLine1 = null;
        this._lastLine2 = null;
        this._lastPlayPauseFile = null;

        // Settings
        this.settings = new Settings.DeskletSettings(this, this.metadata.uuid, instance_id);

        // Bind settings
        this._bindSettings();

        // Layout
        this.mainBox = new St.BoxLayout({ vertical: false });
        this.setContent(this.mainBox);

        // Buttons column
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

        // Spacing widget between buttons and text
        this.spacingWidget = new St.Widget({ style_class: "spacing-widget", reactive: false });
        this.mainBox.add_child(this.spacingWidget);

        // Text column
        this.textVBox = new St.BoxLayout({ vertical: true });
        this.mainBox.add_child(this.textVBox);

        this.labelTitle = new St.Label({ text: "Loading…" });
        this.textVBox.add_child(this.labelTitle);

        this.labelArtist = new St.Label({ text: "" });
        this.textVBox.add_child(this.labelArtist);

        // update things when sizing changes
        this.textVBox.connect('notify::allocation', Lang.bind(this, this._updateAll));

        // initial run
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
        settings.bind("idle_poll_interval", "idlePollInterval", bind(this, this._resetPolling));
    },

    _startPolling: function(idle = false) {
        if (this._pollId) GLib.source_remove(this._pollId);

        const interval = idle ? this.idlePollInterval : this.pollInterval;
        if (interval >= 1) {
            this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, Math.max(1, Math.round(interval)), Lang.bind(this, this._updateStatus));
        } else {
            let ms = Math.max(50, Math.round(interval * 1000));
            this._pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, Lang.bind(this, this._updateStatus));
        }

        global.log(`[music-display@nicholasjdi] Starting polling every ${interval}s`);
    },

    _resetPolling: function() {
        this._startPolling();
    },

    _getPlayerctlArgsArray: function() {
        if (!this.playerWhitelist || !this.playerWhitelist.toString().trim()) return [];
        const players = this.playerWhitelist.split(",").map(p => p.trim()).filter(p => p.length > 0).join(",");
        if (!players) return [];
        const flag = this.treatWhitelistAsBlacklist ? `--ignore-player=${players}` : `--player=${players}`;
        return [flag];
    },

    _runPlayerctlAsync: function(argsArray, callback) {
        try {
            const argv = ['playerctl'];
            const extra = this._getPlayerctlArgsArray();
            for (let e of extra) argv.push(e);
            for (let a of argsArray) argv.push(a);

            let proc = new Gio.Subprocess({
                argv: argv,
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            });

            proc.init(null);
            proc.communicate_utf8_async(null, null, (procObj, res) => {
                try {
                    let [ok, stdout, stderr] = procObj.communicate_utf8_finish(res);
                    callback(ok && stdout ? stdout.toString().trim() : "");
                } catch (e) {
                    callback("");
                }
            });
        } catch (e) {
            callback("");
        }
    },

    _fetchPerPlayerMetadataAsync: function(formatStr, callback) {
        const regex = /%\[([\w\-\.:]+)\]\s+([^%]+)%/g;
        let matches = [];
        let m;
        while ((m = regex.exec(formatStr)) !== null) {
            matches.push({ full: m[0], player: m[1], meta: m[2] });
        }
        if (!matches.length) { callback(formatStr); return; }

        let pending = matches.length;
        let result = formatStr;

        matches.forEach((match) => {
            try {
                const argv = ['playerctl', `--player=${match.player}`, 'metadata', match.meta];
                let proc = new Gio.Subprocess({
                    argv: argv,
                    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                });
                proc.init(null);
                proc.communicate_utf8_async(null, null, (p, res) => {
                    try {
                        let [ok, stdout, stderr] = p.communicate_utf8_finish(res);
                        let val = ok && stdout ? stdout.toString().trim() : "";
                        result = result.replace(match.full, val);
                    } catch (e) {
                        result = result.replace(match.full, "");
                    } finally {
                        pending--;
                        if (pending === 0) callback(result);
                    }
                });
            } catch (e) {
                result = result.replace(match.full, "");
                pending--;
                if (pending === 0) callback(result);
            }
        });
    },

    _replaceDynamicTagsAndUpdateLabels: function(title, artist, album) {
        const base1 = this.line1Format.replace(/%title%/g, title).replace(/%artist%/g, artist).replace(/%album%/g, album);
        const base2 = this.line2Format.replace(/%title%/g, title).replace(/%artist%/g, artist).replace(/%album%/g, album);

        this._fetchPerPlayerMetadataAsync(base1, (final1) => {
            if (final1 !== this._lastLine1) {
                this.labelTitle.set_text(final1);
                this._lastLine1 = final1;
            }
        });
        this._fetchPerPlayerMetadataAsync(base2, (final2) => {
            if (final2 !== this._lastLine2) {
                this.labelArtist.set_text(final2);
                this._lastLine2 = final2;
            }
        });
    },

    _updateAll: function() {
        this._updateFont();
        this.spacingWidget.width = Math.max(0, Math.round(this.buttonTextSpacing));
    },

    _updateFont: function() {
        this.labelTitle.style = `${this.line1Font ? "font-family:" + this.line1Font + ";" : ""} font-size: ${this.line1Size}px;`;
        this.labelArtist.style = `${this.line2Font ? "font-family:" + this.line2Font + ";" : ""} font-size: ${this.line2Size}px;`;
    },

    _updateStatus: function() {
        try {
            this._runPlayerctlAsync(['status'], (statusOut) => {
                const status = statusOut ? statusOut.trim() : "";
                const idle = !status || status === "Stopped";

                // Switch polling interval depending on status
                this._startPolling(idle);

                let showButtons = !idle;

                if (idle) {
                    if (this._lastLine1 !== "No player running") {
                        this.labelTitle.set_text("No player running");
                        this._lastLine1 = "No player running";
                    }
                    if (this._lastLine2 !== "") {
                        this.labelArtist.set_text("");
                        this._lastLine2 = "";
                    }
                }

                if (!showButtons || this.hideAllButtons) {
                    this.buttonVBox.hide();
                    this.spacingWidget.hide();
                } else {
                    this.buttonVBox.show();
                    this.spacingWidget.show();
                    this.spacingWidget.width = Math.max(0, Math.round(this.buttonTextSpacing));
                    if (this.hideSkipButtons) this.skipHBox.hide(); else this.skipHBox.show();
                }

                if (!idle) {
                    this._runPlayerctlAsync(['metadata', 'xesam:title'], (outTitle) => {
                        const title = outTitle || "Unknown Title";
                        this._runPlayerctlAsync(['metadata', 'xesam:artist'], (outArtist) => {
                            const artist = outArtist || "Unknown Artist";
                            this._runPlayerctlAsync(['metadata', 'xesam:album'], (outAlbum) => {
                                const album = outAlbum || "Unknown Album";
                                this._replaceDynamicTagsAndUpdateLabels(title, artist, album);
                                this._updateButtonTextures(status === "Playing");
                            });
                        });
                    });
                } else {
                    this._updateButtonTextures(false);
                }
            });
        } catch (e) {
            global.logError(`[music-display@nicholasjdi] _updateStatus exception: ${e}`);
        }
        return true;
    },

    _updateButtonTextures: function(isPlaying) {
        const basePath = this.metadata.path + "/textures/";
        const playTexture = this.btnPlayTexture || basePath + "play.png";
        const pauseTexture = this.btnPauseTexture || basePath + "pause.png";
        const prevTexture = this.btnPrevTexture || basePath + "previous.png";
        const nextTexture = this.btnNextTexture || basePath + "next.png";

        let playPauseFile = isPlaying ? pauseTexture : playTexture;

        if (playPauseFile !== this._lastPlayPauseFile) {
            this.btnPlayPause.set_child(new St.Icon({ gicon: Gio.icon_new_for_string(playPauseFile), icon_size: this.buttonSize }));
            this.btnPlayPause.height = this.buttonSize;
            this._lastPlayPauseFile = playPauseFile;
        }

        if (!this.hideSkipButtons && !this.hideAllButtons) {
            const skipSize = Math.floor(this.buttonSize / 2);
            this.btnPrev.set_child(new St.Icon({ gicon: Gio.icon_new_for_string(prevTexture), icon_size: skipSize }));
            this.btnPrev.height = skipSize;
            this.btnNext.set_child(new St.Icon({ gicon: Gio.icon_new_for_string(nextTexture), icon_size: skipSize }));
            this.btnNext.height = skipSize;
        }
    },

    _onPlayPausePressed: function() {
        GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgsArray().join(' ')} play-pause`);
    },

    _onPrevPressed: function() {
        GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgsArray().join(' ')} previous`);
    },

    _onNextPressed: function() {
        GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgsArray().join(' ')} next`);
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

