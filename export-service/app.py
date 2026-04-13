#!/usr/bin/env python3
"""
Thes1s Export Service — Tiny Flask API for generating PDF/DOCX reports.
Accepts report JSON via POST, runs the existing Python generators, returns the file.

Endpoints:
  POST /export/one-pager/pdf   { report: {...}, ticker: "CMG" }  → PDF bytes
  POST /export/one-pager/docx  { report: {...}, ticker: "CMG" }  → DOCX bytes
  GET  /health                                                    → { status: "ok" }

Deploy: Render free tier, Fly.io, or any Python host.
"""

import os
import sys
import json
import tempfile
import shutil
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

# Add the scripts/pdf directory to Python path so we can import the generators
SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts', 'pdf')
sys.path.insert(0, SCRIPTS_DIR)

app = Flask(__name__)
CORS(app, origins=[
    'https://thes1sinvesting.com',
    'https://www.thes1sinvesting.com',
    'https://thes1s.pages.dev',
    'http://localhost:5173',
    'http://localhost:4173',
])


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/export/<stage>/<fmt>', methods=['POST'])
def export_report(stage, fmt):
    if fmt not in ('pdf', 'docx'):
        return jsonify({'error': f'Invalid format: {fmt}'}), 400

    valid_stages = {'one-pager', 'pitch-deck', 'full-story'}
    if stage not in valid_stages:
        return jsonify({'error': f'Invalid stage: {stage}'}), 400

    body = request.get_json()
    if not body:
        return jsonify({'error': 'Missing JSON body'}), 400

    ticker = body.get('ticker', 'UNKNOWN').upper()
    report_data = body.get('report')  # The stage data (sections, etc.)
    data_packet = body.get('dataPacket', {})  # Optional DataPacket for charts

    if not report_data:
        return jsonify({'error': 'Missing report data'}), 400

    # Create a temp directory mimicking the expected .thes1s/reports/{TICKER}/ structure
    tmp_base = tempfile.mkdtemp(prefix='thes1s-export-')
    report_dir = os.path.join(tmp_base, '.thes1s', 'reports', ticker)
    os.makedirs(report_dir, exist_ok=True)

    try:
        # Write the report JSON in the format the generators expect
        stage_file_map = {
            'one-pager': 'one-pager.json',
            'pitch-deck': 'pipeline-output.json',
            'full-story': 'full-story-api.json',
        }
        report_file = os.path.join(report_dir, stage_file_map[stage])
        with open(report_file, 'w') as f:
            json.dump(report_data, f)

        # Write data packet if provided (for charts)
        if data_packet:
            with open(os.path.join(report_dir, 'data-packet.json'), 'w') as f:
                json.dump(data_packet, f)

        # Import and run the appropriate generator
        # Pass base_dir to ReportData so it finds files in our temp directory
        if stage == 'one-pager' and fmt == 'pdf':
            from generate_one_pager_pdf import generate_one_pager
            out_path = generate_one_pager(ticker, base_dir=tmp_base)
        elif stage == 'one-pager' and fmt == 'docx':
            from generate_one_pager_docx import generate_one_pager_docx
            out_path = generate_one_pager_docx(ticker, base_dir=tmp_base)
        elif stage == 'pitch-deck' and fmt == 'pdf':
            from generate_pitch_deck_pdf import generate_pitch_deck
            out_path = generate_pitch_deck(ticker, base_dir=tmp_base)
        elif stage == 'pitch-deck' and fmt == 'docx':
            from generate_pitch_deck_docx import generate_pitch_deck_docx
            out_path = generate_pitch_deck_docx(ticker, base_dir=tmp_base)
        elif stage == 'full-story' and fmt == 'pdf':
            from generate_full_story_pdf import generate_full_story
            out_path = generate_full_story(ticker, base_dir=tmp_base)
        elif stage == 'full-story' and fmt == 'docx':
            from generate_full_story_docx import generate_full_story_docx
            out_path = generate_full_story_docx(ticker, base_dir=tmp_base)
        else:
            return jsonify({'error': 'Unhandled stage/format combination'}), 400

        if not out_path or not os.path.exists(out_path):
            return jsonify({'error': 'Generator did not produce output file'}), 500

        # Determine MIME type
        mime = 'application/pdf' if fmt == 'pdf' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ext = '.pdf' if fmt == 'pdf' else '.docx'

        return send_file(
            out_path,
            mimetype=mime,
            as_attachment=True,
            download_name=f'{ticker}-{stage}{ext}',
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500

    finally:
        # Clean up temp directory (after response is sent, Flask handles this)
        # Note: send_file streams the file, so we can't delete immediately.
        # In production, use a background cleanup or tmpwatch.
        pass


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
