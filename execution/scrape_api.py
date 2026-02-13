#!/usr/bin/env python3
"""
API-friendly wrapper for the Playwright banner scraper.
Accepts command-line args and outputs JSON for the Node.js backend.
"""

import sys
import json
import argparse
from pathlib import Path

# Add directives to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from directives.scrape_banners_stealth import scrape_site_full


def main():
    parser = argparse.ArgumentParser(description='Scrape banner images from a website')
    parser.add_argument('--url', required=True, help='Website URL to scrape')
    parser.add_argument('--location', type=int, default=1, choices=range(1, 11),
                        help='Location code (1-10)')
    parser.add_argument('--headless', type=str, default='true',
                        choices=['true', 'false'], help='Run in headless mode')
    parser.add_argument('--json', action='store_true',
                        help='Output results as JSON')

    args = parser.parse_args()

    url = args.url
    location_id = args.location
    headless = args.headless == 'true'

    # Map location ID to country code
    location_map = {
        1: 'US', 2: 'UK', 3: 'CA', 4: 'AU', 5: 'DE',
        6: 'FR', 7: 'JP', 8: 'BR', 9: 'IN', 10: 'SG'
    }
    location = location_map[location_id]

    print(f"[*] Starting banner scrape for: {url}")
    print(f"[*] Location: {location} ({location_id}) | Headless: {headless}")
    print("=" * 60)

    try:
        # Run the scraper
        results = scrape_site_full(url, headless=headless, location=location)

        # Convert results to JSON-serializable format
        output = {
            'homepage': [],
            'promotions': []
        }

        if results.get('homepage'):
            for banner in results['homepage']:
                output['homepage'].append({
                    'src': banner['src'],
                    'alt': banner.get('alt', ''),
                    'width': banner.get('width', 'auto'),
                    'height': banner.get('height', 'auto'),
                    'type': banner.get('type', 'Banner Image')
                })

        if results.get('promotions'):
            for banner in results['promotions']:
                output['promotions'].append({
                    'src': banner['src'],
                    'alt': banner.get('alt', ''),
                    'width': banner.get('width', 'auto'),
                    'height': banner.get('height', 'auto'),
                    'type': banner.get('type', 'Banner Image')
                })

        print("\n" + "=" * 60)
        print("[+] Scraping completed successfully")
        print(f"[+] Homepage banners: {len(output['homepage'])}")
        print(f"[+] Promotions banners: {len(output['promotions'])}")
        print("=" * 60)

        if args.json:
            # Output JSON to stdout (will be captured by Node.js)
            print("\n" + json.dumps(output, indent=2))

    except Exception as e:
        print(f"\n[-] Error: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
