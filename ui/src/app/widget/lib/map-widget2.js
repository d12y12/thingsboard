/*
 * Copyright © 2016-2017 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import tinycolor from 'tinycolor2';

import TbGoogleMap from './google-map';
import TbOpenStreetMap from './openstreet-map';

import {processPattern, arraysEqual, toLabelValueMap, fillPattern} from './widget-utils';

export default class TbMapWidgetV2 {
    constructor(mapProvider, drawRoutes, ctx, useDynamicLocations, $element) {
        var tbMap = this;
        this.ctx = ctx;
        if (!$element) {
            $element = ctx.$container;
        }
        this.utils = ctx.$scope.$injector.get('utils');
        this.drawRoutes = drawRoutes;
        this.markers = [];
        if (this.drawRoutes) {
            this.polylines = [];
        }

        this.locationSettings = {};

        var settings = ctx.settings;

        this.callbacks = {};
        this.callbacks.onLocationClick = function(){};

        if (settings.defaultZoomLevel) {
            if (settings.defaultZoomLevel > 0 && settings.defaultZoomLevel < 21) {
                this.defaultZoomLevel = Math.floor(settings.defaultZoomLevel);
            }
        }

        this.dontFitMapBounds = settings.fitMapBounds === false;

        if (!useDynamicLocations) {
            this.subscription = this.ctx.defaultSubscription;
            this.configureLocationsSettings();
        }

        var minZoomLevel = this.drawRoutes ? 18 : 15;

        var initCallback = function() {
            tbMap.update();
            tbMap.resize();
        };

        if (mapProvider === 'google-map') {
            this.map = new TbGoogleMap($element, initCallback, this.defaultZoomLevel, this.dontFitMapBounds, minZoomLevel, settings.gmApiKey, settings.gmDefaultMapType);
        } else if (mapProvider === 'openstreet-map') {
            this.map = new TbOpenStreetMap($element, initCallback, this.defaultZoomLevel, this.dontFitMapBounds, minZoomLevel);
        }
    }

    setCallbacks(callbacks) {
        Object.assign(this.callbacks, callbacks);
    }

    configureLocationsSettings() {

        this.locationSettings.latKeyName = this.ctx.settings.latKeyName || 'latitude';
        this.locationSettings.lngKeyName = this.ctx.settings.lngKeyName || 'longitude';

        this.locationSettings.tooltipPattern = this.ctx.settings.tooltipPattern || "<b>${entityName}</b><br/><br/><b>Latitude:</b> ${"+this.locationSettings.latKeyName+":7}<br/><b>Longitude:</b> ${"+this.locationSettings.lngKeyName+":7}";

        //TODO:
        //this.locationSettings.tooltipReplaceInfo = procesTooltipPattern(this, this.locationsSettings[i].tooltipPattern, this.subscription.datasources);

        this.locationSettings.showLabel = this.ctx.settings.showLabel !== false;
        this.locationSettings.displayTooltip = true;
        this.locationSettings.labelColor = this.ctx.widgetConfig.color || '#000000',
        this.locationSettings.label = this.ctx.settings.label || "${entityName}";
        this.locationSettings.color = this.ctx.settings.color ? tinycolor(this.ctx.settings.color).toHexString() : "#FE7569";

        this.locationSettings.useColorFunction = this.ctx.settings.useColorFunction === true;
        if (angular.isDefined(this.ctx.settings.colorFunction) && this.ctx.settings.colorFunction.length > 0) {
            try {
                this.locationSettings.colorFunction = new Function('data, dsData, dsIndex', this.ctx.settings.colorFunction);
            } catch (e) {
                this.locationSettings.colorFunction = null;
            }
        }

        this.locationSettings.useMarkerImageFunction = this.ctx.settings.useMarkerImageFunction === true;
        if (angular.isDefined(this.ctx.settings.markerImageFunction) &&this.ctx.settings.markerImageFunction.length > 0) {
            try {
                this.locationSettings.markerImageFunction = new Function('data, images, dsData, dsIndex', this.ctx.settings.markerImageFunction);
            } catch (e) {
                this.locationSettings.markerImageFunction = null;
            }
        }

        this.locationSettings.markerImages = this.ctx.settings.markerImages || [];

        if (!this.locationSettings.useMarkerImageFunction &&
            angular.isDefined(this.ctx.settings.markerImage) &&
            this.ctx.settings.markerImage.length > 0) {
            this.locationSettings.markerImage = this.ctx.settings.markerImage;
            this.locationSettings.useMarkerImage = true;
            this.locationSettings.markerImageSize = this.ctx.settings.markerImageSize || 34;
        }

        if (this.drawRoutes) {
            this.locationSettings.strokeWeight = this.ctx.settings.strokeWeight || 2;
            this.locationSettings.strokeOpacity = this.ctx.settings.strokeOpacity || 1.0;
        }


    }

    update() {

        var tbMap = this;

        function updateLocationLabel(location) {
            if (location.settings.showLabel && location.settings.labelReplaceInfo.variables.length) {
                var labelText = fillPattern(location.settings.label,
                    location.settings.labelReplaceInfo, tbMap.subscription.data);
                tbMap.map.updateMarkerLabel(location.marker, location.settings, labelText);
                //TODO: update openStreetMap
            }
        }

        function calculateLocationColor(location, dataMap) {
            if (location.settings.useColorFunction && location.settings.colorFunction) {
                var color = '#FE7569';
                try {
                    color = location.settings.colorFunction(dataMap.dataMap, dataMap.dsDataMap, location.dsIndex);
                } catch (e) {
                    color = '#FE7569';
                }
                return tinycolor(color).toHexString();
            } else {
                return location.settings.color;
            }
        }

        function updateLocationColor(location, dataMap) {
            var color = calculateLocationColor(location, dataMap);
            if (!location.settings.calculatedColor || location.settings.calculatedColor !== color) {
                if (!location.settings.useMarkerImage) {
                    tbMap.map.updateMarkerColor(location.marker, color);
                }
                if (location.polyline) {
                    tbMap.map.updatePolylineColor(location.polyline, location.settings, color);
                }
                location.settings.calculatedColor = color;
            }
        }

        function calculateLocationMarkerImage(location, dataMap) {
            if (location.settings.useMarkerImageFunction && location.settings.markerImageFunction) {
                var image = null;
                try {
                    image = location.settings.markerImageFunction(dataMap.dataMap, location.settings.markerImages, dataMap.dsDataMap, location.dsIndex);
                } catch (e) {
                    image = null;
                }
                return image;
            } else {
                return null;
            }
        }

        function updateLocationMarkerImage(location, dataMap) {
            var image = calculateLocationMarkerImage(location, dataMap);
            if (image != null && (!location.settings.calculatedImage || !angular.equals(location.settings.calculatedImage, image))) {
                tbMap.map.updateMarkerImage(location.marker, location.settings, image.url, image.size);
                location.settings.calculatedImage = image;
            }
        }

        function updateLocationStyle(location, dataMap) {
            updateLocationLabel(location);
            updateLocationColor(location, dataMap);
            updateLocationMarkerImage(location, dataMap);
        }

        function updateLocation(location, data, dataMap) {
            var locationChanged = false;
            if (location.latIndex > -1 && location.lngIndex > -1) {
                var latData = data[location.latIndex].data;
                var lngData = data[location.lngIndex].data;
                var lat, lng, latLng;
                if (latData.length > 0 && lngData.length > 0) {
                    if (tbMap.drawRoutes) {
                        // Create or update route
                        var latLngs = [];
                        for (var i = 0; i < latData.length; i++) {
                            lat = latData[i][1];
                            lng = lngData[i][1];
                            latLng = tbMap.map.createLatLng(lat, lng);
                            if (i == 0 || !latLngs[latLngs.length - 1].equals(latLng)) {
                                latLngs.push(latLng);
                            }
                        }
                        if (latLngs.length > 0) {
                            var markerLocation = latLngs[latLngs.length - 1];
                            if (!location.marker) {
                                location.marker = tbMap.map.createMarker(markerLocation, location.settings,
                                    function () {
                                        tbMap.callbacks.onLocationClick(location);
                                    }
                                );
                            } else {
                                tbMap.map.setMarkerPosition(location.marker, markerLocation);
                            }
                        }
                        if (!location.polyline) {
                            location.polyline = tbMap.map.createPolyline(latLngs, location.settings);
                            tbMap.polylines.push(location.polyline);
                            locationChanged = true;
                        } else {
                            var prevPath = tbMap.map.getPolylineLatLngs(location.polyline);
                            if (!prevPath || !arraysEqual(prevPath, latLngs)) {
                                tbMap.map.setPolylineLatLngs(location.polyline, latLngs);
                                locationChanged = true;
                            }
                        }
                    } else {
                        // Create or update marker
                        lat = latData[latData.length - 1][1];
                        lng = lngData[lngData.length - 1][1];
                        latLng = tbMap.map.createLatLng(lat, lng);
                        if (!location.marker) {
                            location.marker = tbMap.map.createMarker(latLng, location.settings, function () {
                                tbMap.callbacks.onLocationClick(location);
                            });
                            tbMap.markers.push(location.marker);
                            locationChanged = true;
                        } else {
                            var prevPosition = tbMap.map.getMarkerPosition(location.marker);
                            if (!prevPosition.equals(latLng)) {
                                tbMap.map.setMarkerPosition(location.marker, latLng);
                                locationChanged = true;
                            }
                        }
                    }
                    updateLocationStyle(location, dataMap);
                }
            }
            return locationChanged;
        }

        function loadLocations(data, datasources) {
            var bounds = tbMap.map.createBounds();
            tbMap.locations = [];
            var dataMap = toLabelValueMap(data, datasources);
            var currentDatasource = null;
            var currentDatasourceIndex = -1;
            var latIndex = -1;
            var lngIndex = -1;

            for (var i=0;i<data.length;i++) {
                var dataKeyData = data[i];
                var dataKey = dataKeyData.dataKey;
                if (dataKeyData.datasource != currentDatasource) {
                    currentDatasource = dataKeyData.datasource;
                    currentDatasourceIndex++;
                    latIndex = -1;
                    lngIndex = -1;
                }
                var nameToCheck;
                if (dataKey.locationAttrName) {
                    nameToCheck = dataKey.locationAttrName;
                } else {
                    nameToCheck = dataKey.label;
                }
                if (nameToCheck === tbMap.locationSettings.latKeyName) {
                    latIndex = i;
                } else if (nameToCheck === tbMap.locationSettings.lngKeyName) {
                    lngIndex = i;
                }
                if (latIndex > -1 && lngIndex > -1) {
                    var location = {
                        latIndex: latIndex,
                        lngIndex: lngIndex,
                        dsIndex: currentDatasourceIndex,
                        settings: angular.copy(tbMap.locationSettings)
                    };
                    if (location.settings.showLabel) {
                        location.settings.label = tbMap.utils.createLabelFromDatasource(currentDatasource, location.settings.label);
                        location.settings.labelReplaceInfo = processPattern(location.settings.label, datasources, currentDatasourceIndex);
                    }
                    if (location.settings.displayTooltip) {
                        location.settings.tooltipPattern = tbMap.utils.createLabelFromDatasource(currentDatasource, location.settings.tooltipPattern);
                        location.settings.tooltipReplaceInfo = processPattern(location.settings.tooltipPattern, datasources, currentDatasourceIndex);
                    }

                    tbMap.locations.push(location);
                    updateLocation(location, data, dataMap);
                    if (location.polyline) {
                        tbMap.map.extendBounds(bounds, location.polyline);
                    } else if (location.marker) {
                        tbMap.map.extendBoundsWithMarker(bounds, location.marker);
                    }
                    latIndex = -1;
                    lngIndex = -1;
                }

            }
            tbMap.map.fitBounds(bounds);
        }

        function updateLocations(data, datasources) {
            var locationsChanged = false;
            var bounds = tbMap.map.createBounds();
            var dataMap = toLabelValueMap(data, datasources);
            for (var p = 0; p < tbMap.locations.length; p++) {
                var location = tbMap.locations[p];
                locationsChanged |= updateLocation(location, data, dataMap);
                if (location.polyline) {
                    tbMap.map.extendBounds(bounds, location.polyline);
                } else if (location.marker) {
                    tbMap.map.extendBoundsWithMarker(bounds, location.marker);
                }
            }
            if (locationsChanged) {
                tbMap.map.fitBounds(bounds);
            }
        }

        if (this.map && this.map.inited() && this.subscription) {
            if (this.subscription.data) {
                if (!this.locations) {
                    loadLocations(this.subscription.data, this.subscription.datasources);
                } else {
                    updateLocations(this.subscription.data, this.subscription.datasources);
                }
                var tooltips = this.map.getTooltips();
                for (var t=0; t < tooltips.length; t++) {
                    var tooltip = tooltips[t];
                    var text = fillPattern(tooltip.pattern, tooltip.replaceInfo, this.subscription.data);
                    tooltip.popup.setContent(text);
                }
            }
        }
    }

    resize() {
        if (this.map && this.map.inited()) {
            this.map.invalidateSize();
            if (this.locations && this.locations.length > 0) {
                var bounds = this.map.createBounds();
                for (var m = 0; m < this.markers.length; m++) {
                    this.map.extendBoundsWithMarker(bounds, this.markers[m]);
                }
                if (this.polylines) {
                    for (var p = 0; p < this.polylines.length; p++) {
                        this.map.extendBounds(bounds, this.polylines[p]);
                    }
                }
                this.map.fitBounds(bounds);
            }
        }
    }

    static settingsSchema(mapProvider) {
        var schema;
        if (mapProvider === 'google-map') {
            schema = angular.copy(googleMapSettingsSchema);
        } else if (mapProvider === 'openstreet-map') {
            schema = angular.copy(openstreetMapSettingsSchema);
        }
        angular.merge(schema.schema.properties, commonMapSettingsSchema.schema.properties);
        schema.schema.required = schema.schema.required.concat(commonMapSettingsSchema.schema.required);
        schema.form = schema.form.concat(commonMapSettingsSchema.form);
        return schema;
    }

    static dataKeySettingsSchema(/*mapProvider*/) {
        return {};
    }

}

const googleMapSettingsSchema =
    {
        "schema":{
            "title":"Google Map Configuration",
            "type":"object",
            "properties":{
                "gmApiKey":{
                    "title":"Google Maps API Key",
                    "type":"string"
                },
                "gmDefaultMapType":{
                    "title":"Default map type",
                    "type":"string",
                    "default":"roadmap"
                }
            },
            "required":[
                "gmApiKey"
            ]
        },
        "form":[
            "gmApiKey",
            {
                "key":"gmDefaultMapType",
                "type":"rc-select",
                "multiple":false,
                "items":[
                    {
                        "value":"roadmap",
                        "label":"Roadmap"
                    },
                    {
                        "value":"satellite",
                        "label":"Satellite"
                    },
                    {
                        "value":"hybrid",
                        "label":"Hybrid"
                    },
                    {
                        "value":"terrain",
                        "label":"Terrain"
                    }
                ]
            }
        ]
    };

const openstreetMapSettingsSchema =
    {
        "schema":{
            "title":"Google Map Configuration",
            "type":"object",
            "properties":{
            },
            "required":[
            ]
        },
        "form":[
        ]
    };

const commonMapSettingsSchema =
    {
        "schema":{
            "title":"Map Configuration",
            "type":"object",
            "properties":{
                "defaultZoomLevel":{
                    "title":"Default map zoom level (1 - 20)",
                    "type":"number"
                },
                "fitMapBounds":{
                    "title":"Fit map bounds to cover all markers",
                    "type":"boolean",
                    "default":true
                },
                "latKeyName":{
                    "title":"Latitude key name",
                    "type":"string",
                    "default":"latitude"
                },
                "lngKeyName":{
                    "title":"Longitude key name",
                    "type":"string",
                    "default":"longitude"
                },
                "showLabel":{
                    "title":"Show label",
                    "type":"boolean",
                    "default":true
                },
                "label":{
                    "title":"Label",
                    "type":"string",
                    "default":"${entityName}"
                },
                "tooltipPattern":{
                    "title":"Pattern ( for ex. 'Text ${keyName} units.' or '${#<key index>} units'  )",
                    "type":"string",
                    "default":"<b>${entityName}</b><br/><br/><b>Latitude:</b> ${latitude:7}<br/><b>Longitude:</b> ${longitude:7}"
                },
                "color":{
                    "title":"Color",
                    "type":"string"
                },
                "useColorFunction":{
                    "title":"Use color function",
                    "type":"boolean",
                    "default":false
                },
                "colorFunction":{
                    "title":"Color function: f(data, dsData, dsIndex)",
                    "type":"string"
                },
                "markerImage":{
                    "title":"Custom marker image",
                    "type":"string"
                },
                "markerImageSize":{
                    "title":"Custom marker image size (px)",
                    "type":"number",
                    "default":34
                },
                "useMarkerImageFunction":{
                    "title":"Use marker image function",
                    "type":"boolean",
                    "default":false
                },
                "markerImageFunction":{
                    "title":"Marker image function: f(data, images, dsData, dsIndex)",
                    "type":"string"
                },
                "markerImages":{
                    "title":"Marker images",
                    "type":"array",
                    "items":{
                        "title":"Marker image",
                        "type":"string"
                    }
                }
            },
            "required":[]
        },
        "form":[
            "defaultZoomLevel",
            "fitMapBounds",
            "latKeyName",
            "lngKeyName",
            "showLabel",
            "label",
            "tooltipPattern",
            {
                "key":"color",
                "type":"color"
            },
            "useColorFunction",
            {
                "key":"colorFunction",
                "type":"javascript"
            },
            {
                "key":"markerImage",
                "type":"image"
            },
            "markerImageSize",
            "useMarkerImageFunction",
            {
                "key":"markerImageFunction",
                "type":"javascript"
            },
            {
                "key":"markerImages",
                "items":[
                    {
                        "key":"markerImages[]",
                        "type":"image"
                    }
                ]
            }
        ]
};
