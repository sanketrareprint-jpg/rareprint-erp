"""
City Photos
═══════════
Returns Rareprint customer sample photos for a given city.
"""

# City -> list of image URLs
CITY_PHOTOS: dict[str, list[str]] = {}


def get_city_photos(city: str) -> list[str]:
    """Return sample product photos for a city, or empty list if none."""
    if not city:
        return []
    city_lower = city.lower().strip()
    if city_lower in CITY_PHOTOS:
        return CITY_PHOTOS[city_lower]
    for key, photos in CITY_PHOTOS.items():
        if key in city_lower or city_lower in key:
            return photos
    return []
