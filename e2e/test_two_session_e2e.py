import os
import pytest
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.getenv("PLAYWRIGHT_BASE_URL", "http://localhost:8100")

def test_two_session_collaboration():
    """
    End-to-End Test: Two-Session Collaborative System Design Interview Test
    
    1. Log in as the interviewer (session 1).
    2. Create an interview session.
    3. Share the join link.
    4. Join from a separate client as the candidate (session 2).
    5. Change the canvas as the candidate (session 2).
    6. Verify that the interviewer sees the change in real-time (session 1).
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # -------------------------------------------------------------
        # Session 1: Interviewer Context
        # -------------------------------------------------------------
        interviewer_context = browser.new_context(
            viewport={"width": 1280, "height": 800}
        )
        page1 = interviewer_context.new_page()

        # Step 1: Log in as the interviewer
        page1.goto(f"{BASE_URL}/auth")
        page1.wait_for_selector("#email")
        page1.fill("#email", "interviewer@example.com")
        page1.fill("#password", "password123")
        page1.click('button[type="submit"]')

        # Verify navigated to dashboard
        page1.wait_for_url("**/dashboard**", timeout=15000)

        # Step 2: Create an interview session
        page1.wait_for_selector("#t")
        page1.fill("#t", "Realtime System Design Interview")
        page1.fill("#c", "Candidate Alice")
        page1.fill("#r", "Senior AI Engineer")
        page1.click('button:has-text("Create board")')

        # Wait until board page opens for interviewer
        page1.wait_for_url("**/b/*", timeout=15000)
        board_url = page1.url
        assert "/b/" in board_url

        # Ensure board canvas loads for interviewer
        page1.wait_for_selector("aside:has-text('Components')", timeout=15000)

        # -------------------------------------------------------------
        # Session 2: Candidate Context (Separate client/cookies)
        # -------------------------------------------------------------
        candidate_context = browser.new_context(
            viewport={"width": 1280, "height": 800}
        )
        page2 = candidate_context.new_page()

        # Step 3 & 4: Share the join link & join as candidate
        page2.goto(board_url)

        # Fill candidate join name modal if presented
        try:
            page2.wait_for_selector("#candidateName", timeout=5000)
            page2.fill("#candidateName", "Candidate Alice")
            page2.click('button:has-text("Enter Board")')
        except Exception:
            pass  # If auto-joined or name pre-filled

        # Wait for candidate canvas to load
        page2.wait_for_selector("aside:has-text('Components')", timeout=15000)

        # Step 5: Change the canvas as the candidate (add a Database node)
        # Click the "Database" component button in the palette
        db_btn = page2.locator('aside button:has-text("Database")').first
        db_btn.wait_for(state="visible", timeout=5000)
        db_btn.click()

        # Verify the Database node is rendered on Candidate's canvas
        candidate_node = page2.locator('svg text:has-text("Database")').first
        expect(candidate_node).to_be_visible(timeout=8000)

        # Step 6: Verify that the interviewer sees the change in real-time
        interviewer_node = page1.locator('svg text:has-text("Database")').first
        expect(interviewer_node).to_be_visible(timeout=10000)

        # Clean up browser contexts
        interviewer_context.close()
        candidate_context.close()
        browser.close()
