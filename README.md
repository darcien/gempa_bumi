# gempa_bumi

Historical data of earthquakes scraped from
[Indonesia's BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)](https://www.bmkg.go.id/).

Check `earthquakes/` for the data. Or view it using [Flat Viewer][flatviewer].
The oldest record is earthquake on 2022-12-14.

[flatviewer]: https://flatgithub.com/darcien/gempa_bumi?filename=earthquakes%2Fbmkg_earthquakes_felt.json

## Data Quality

### Erroneous Data

Some earthquake records may contain a `meta.erroneousDataReason` field,
indicating that the data has known quality issues:

- **`FUTURE_EARTHQUAKE`**: The earthquake's timestamp is in the future compared
  to when the scraper ran. This indicates an error in BMKG's source data, such
  as inconsistent timestamps between the API response and rendered shakemap
  image. The timestamp might be off by several minutes to years.

### Shakemap URL

Each earthquake record includes a `shakeMapUrl` field that links to the shakemap
image on BMKG's servers. However, some of these URLs may return HTTP 404 errors.
Even the official BMKG website fails to load the image.

```shell
$ curl -i https://static.bmkg.go.id/20251221192114.mmi.jpg
HTTP/2 404
date: Wed, 24 Dec 2025 13:36:10 GMT
content-type: application/xml; charset=UTF-8
content-length: 127

<?xml version='1.0' encoding='UTF-8'?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>
```

If you found an invalid shakemap URL in this repository, but the BMKG website
shows a valid image, please let me know.

## Attribution, license, data usage etc.

The source code available here is licensed under the MIT license.

I do not own the earthquakes data. The earthquakes data is owned by BMKG and
should be attributed to them. For usage rights of the data, please contact
[DATA ONLINE BMKG][dataonline].

[dataonline]: https://dataonline.bmkg.go.id
