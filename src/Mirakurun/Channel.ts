/*
   Copyright 2016 Yuki KAN

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
/// <reference path="../../typings/index.d.ts" />
"use strict";

import * as stream from "stream";
import * as common from "./common";
import * as log from "./log";
import _ from "./_";
import queue from "./queue";
import ChannelItem from "./ChannelItem";
import Tuner from "./Tuner";

export default class Channel {

    private _items: ChannelItem[] = [];
    private _epgGatheringInterval = _.config.server.epgGatheringInterval || 1000 * 60 * 15;

    constructor() {

        _.channel = this;

        this._load();

        setTimeout(this._epgGatherer.bind(this), 1000 * 60);
    }

    get items(): ChannelItem[] {
        return this._items;
    }

    add(item: ChannelItem): void {

        if (this.get(item.type, item.channel) === null) {
            this._items.push(item);
        }
    }

    get(type: common.ChannelType, channel: string): ChannelItem {

        for (let i = 0, l = this._items.length; i < l; i++) {
            if (this._items[i].channel === channel && this._items[i].type === type) {
                return this._items[i];
            }
        }

        return null;
    }

    findByType(type: common.ChannelType): ChannelItem[] {

        const items = [];

        for (let i = 0, l = this._items.length; i < l; i++) {
            if (this._items[i].type === type) {
                items.push(this._items[i]);
            }
        }

        return items;
    }

    private _load(): void {

        log.debug("loading channels...");

        const channels = _.config.channels;

        channels.forEach((channel, i) => {

            if (typeof channel.name !== "string") {
                log.error("invalid type of property `name` in channel#%d configuration", i);
                return;
            }

            if (channel.type !== "GR" && channel.type !== "BS" && channel.type !== "CS" && channel.type !== "SKY") {
                log.error("invalid type of property `type` in channel#%d (%s) configuration", i, channel.name);
                return;
            }

            if (typeof channel.channel !== "string") {
                log.error("invalid type of property `channel` in channel#%d (%s) configuration", i, channel.name);
                return;
            }

            if (channel.satelite && typeof channel.satelite !== "string") {
                log.error("invalid type of property `satelite` in channel#%d (%s) configuration", i, channel.name);
                return;
            }

            if (channel.serviceId && typeof channel.serviceId !== "number") {
                log.error("invalid type of property `serviceId` in channel#%d (%s) configuration", i, channel.name);
                return;
            }

            if (channel.isDisabled === true) {
                return;
            }

            if (Tuner.typeExists(channel.type) === false) {
                return;
            }

            new ChannelItem(channel);
        });
    }

    private _epgGatherer(): void {

        queue.add(() => {

            const networkIds = [...new Set(_.service.items.map(item => item.networkId))];

            networkIds.forEach(networkId => {

                const services = _.service.findByNetworkId(networkId);

                if (services.length === 0) {
                    return;
                }

                log.info("Network#%d EPG gathering has queued", networkId);

                queue.add(() => {
                    return new Promise((resolve) => {

                        log.info("Network#%d EPG gathering has started", networkId);

                        Tuner.getEPG(services[0].channel)
                            .then(() => {
                                log.info("Network#%d EPG gathering has finished", networkId);
                                resolve();
                            })
                            .catch(error => {
                                log.error("Network#%d EPG gathering has failed [%s]", networkId, error);
                                resolve();
                            });
                    });
                });
            });

            queue.add(() => {
                setTimeout(this._epgGatherer.bind(this), this._epgGatheringInterval);
                return Promise.resolve();
            });

            return Promise.resolve();
        });
    }

    static add(item: ChannelItem): void {
        return _.channel.add(item);
    }

    static get(type: common.ChannelType, channel: string): ChannelItem {
        return _.channel.get(type, channel);
    }

    static findByType(type: common.ChannelType): ChannelItem[] {
        return _.channel.findByType(type);
    }

    static all(): ChannelItem[] {
        return _.channel.items;
    }
}