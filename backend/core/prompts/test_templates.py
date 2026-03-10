"""
Test templates for common QA testing scenarios.
Each template provides predefined testing instructions for specific use cases.
"""

from typing import TypedDict


class TestTemplate(TypedDict):
    name: str
    description: str
    system_prompt_addition: str
    steps_hint: str


FULL_AUDIT: TestTemplate = {
    "name": "Full Site Audit",
    "description": "Comprehensive site-wide quality assurance check",
    "system_prompt_addition": """
# Full Site Audit Testing Protocol

Your task is to perform a comprehensive audit of the entire website. This includes:

## Navigation & Links
- Test all navigation menus (primary, footer, mobile)
- Check all internal links for 404 errors
- Verify external links open in new tabs
- Test breadcrumb navigation (if present)
- Check all CTAs (Call-to-Action buttons)

## Content & Media
- Verify all images load correctly
- Check for broken image links (alt text for missing images)
- Test video embeds and playback
- Verify downloadable files are accessible
- Check for lorem ipsum or placeholder text

## Forms & Interactions
- Test all forms on the site (contact, newsletter, search, etc.)
- Verify form validation (required fields, email format, etc.)
- Test form submission and error handling
- Check for CSRF protection

## Console & Errors
- Monitor browser console for JavaScript errors
- Check for failed network requests (4xx, 5xx status codes)
- Identify any warnings or deprecation notices
- Test with browser dev tools open

## Performance
- Measure page load times for key pages
- Check Core Web Vitals (LCP, FID, CLS)
- Identify unoptimized images or large resources
- Test lazy loading implementation

## Mobile & Responsive
- Test at mobile (375px), tablet (768px), desktop (1280px) viewports
- Check for layout breaks or overlapping elements
- Verify touch targets are appropriately sized
- Test mobile navigation (hamburger menus)

## Accessibility
- Check image alt text
- Verify semantic HTML structure
- Test keyboard navigation (Tab, Enter, Escape)
- Check color contrast ratios
- Verify ARIA labels on interactive elements

## SEO Basics
- Check for meta title and description on key pages
- Verify heading hierarchy (H1, H2, H3)
- Check for Open Graph tags
- Verify canonical URLs
""",
    "steps_hint": "Navigate through all main pages, test all interactive elements, document issues by severity, take screenshots of problems."
}


SIGNUP_FLOW: TestTemplate = {
    "name": "Signup Flow Testing",
    "description": "Test user registration and account creation flow",
    "system_prompt_addition": """
# Signup Flow Testing Protocol

Your task is to thoroughly test the user registration/signup process.

## Test Cases to Execute

### 1. Happy Path - Valid Signup
- Navigate to signup page
- Fill all required fields with valid data
- Submit form
- Verify success message/redirect
- Screenshot each step

### 2. Form Validation
Test each field individually:
- Empty fields (test required validation)
- Invalid email formats (test@, @test.com, test, test@test)
- Weak passwords (if password requirements exist)
- Mismatched password confirmation
- Special characters in name fields
- SQL injection attempts in input fields

### 3. Username/Email Uniqueness
- Try registering with an already-used email/username
- Verify appropriate error message appears
- Check that error message doesn't leak security info

### 4. Password Requirements
- Test password visibility toggle (if present)
- Verify password strength indicator (if present)
- Test minimum length requirements
- Test special character requirements
- Screenshot password validation feedback

### 5. Terms & Conditions
- Check if ToS checkbox is required
- Verify ToS link opens correctly
- Test submission without accepting ToS

### 6. Social Signup (if available)
- Test Google OAuth flow
- Test Facebook login flow
- Test GitHub login (if available)
- Verify account creation via social providers

### 7. Email Verification (if applicable)
- Check for verification email instructions
- Note if email verification is required
- Test resend verification email (if available)

### 8. Edge Cases
- Very long input strings (>255 characters)
- Unicode characters (emojis, non-Latin scripts)
- Leading/trailing whitespace in inputs
- Case sensitivity for email/username

### 9. UX & Accessibility
- Tab order through form fields
- Error message clarity and placement
- Field labels and placeholders
- Loading states during submission
- Success feedback clarity

## Documentation Requirements
For each test case, document:
- Input values used
- Expected behavior
- Actual behavior
- Screenshot evidence
- Severity of any issues found
""",
    "steps_hint": "Test valid signup, test all validation rules, try edge cases, verify error messages, document all issues."
}


CHECKOUT_FLOW: TestTemplate = {
    "name": "Checkout Flow Testing",
    "description": "Test e-commerce checkout and payment process",
    "system_prompt_addition": """
# Checkout Flow Testing Protocol

Your task is to test the complete checkout process from cart to purchase confirmation.

## Test Cases to Execute

### 1. Shopping Cart
- Add items to cart (single item, multiple items)
- Update quantities (increase, decrease, zero, negative)
- Remove items from cart
- Test "Continue Shopping" flow
- Verify cart persistence (refresh page, new tab)
- Test empty cart state
- Screenshot cart at each state

### 2. Price Calculations
- Verify item prices are correct
- Check subtotal calculation
- Test coupon/promo code application
- Verify tax calculation (if applicable)
- Check shipping cost calculation
- Verify final total is accurate
- Screenshot price breakdown

### 3. Checkout Form - Shipping Info
- Test all required fields
- Verify address validation
- Test address autocomplete (if present)
- Check country/state/province dropdowns
- Test zip/postal code validation
- Verify phone number formatting

### 4. Checkout Form - Payment Info
- Test credit card number validation
- Verify expiry date validation (MM/YY format)
- Test CVV field validation (3-4 digits)
- Check for PCI compliance indicators (secure badges)
- Test payment method switching (if multiple options)
- Verify billing address same as shipping option

### 5. Guest vs. Account Checkout
- Test guest checkout flow (if available)
- Test checkout as logged-in user
- Verify saved addresses/payment methods (if applicable)
- Test "Create account during checkout" option

### 6. Order Review
- Verify all order details are displayed correctly
- Check edit functionality (go back to cart/shipping/payment)
- Test terms and conditions checkbox
- Verify "Place Order" button is prominent

### 7. Payment Processing
- Test payment loading state
- Check for timeout handling
- Verify error messages for declined cards
- Test payment retry flow

### 8. Order Confirmation
- Verify confirmation page displays
- Check order number is generated
- Verify confirmation email mention
- Test "Print receipt" or "Download invoice" (if available)
- Screenshot confirmation page

### 9. Edge Cases & Security
- Test with items that go out of stock during checkout
- Try negative quantities
- Test extremely large quantities
- Try coupon codes (valid, invalid, expired)
- Test XSS in input fields
- Verify HTTPS throughout checkout
- Check for CSRF protection

### 10. UX & Performance
- Check loading indicators during processing
- Verify error messages are clear
- Test back button behavior
- Check mobile checkout experience
- Measure checkout completion time

## Documentation Requirements
For each test case, document:
- Steps taken
- Data entered (mask sensitive info in report)
- Expected vs. actual behavior
- Screenshots at each major step
- Any security concerns
- Severity of issues found
""",
    "steps_hint": "Add items to cart, proceed to checkout, test all form validations, verify calculations, test payment form, document issues."
}


FORM_VALIDATION: TestTemplate = {
    "name": "Form Validation Testing",
    "description": "Test all forms with valid, invalid, and edge case data",
    "system_prompt_addition": """
# Form Validation Testing Protocol

Your task is to comprehensively test all forms on the website with various input scenarios.

## Forms to Test
- Contact forms
- Newsletter signup
- Search forms
- Login/Signup forms
- Comment/feedback forms
- File upload forms
- Multi-step forms
- Any other input forms found

## Test Categories

### 1. Required Field Validation
For each form:
- Submit with all fields empty
- Submit with one required field missing at a time
- Verify error messages appear
- Check error message clarity and placement
- Screenshot validation errors

### 2. Data Type Validation

**Email Fields:**
- Valid: user@example.com
- Invalid: user@, @example.com, user, user@example, user@.com
- Edge case: user+tag@example.com, user.name@example.co.uk

**Phone Fields:**
- Valid formats: (555) 123-4567, 555-123-4567, +1-555-123-4567
- Invalid: abc-def-ghij, 123, 555-CALL-NOW
- Edge case: international formats

**Number Fields:**
- Valid numbers
- Negative numbers (if not allowed)
- Decimals (if not allowed)
- Very large numbers
- Zero
- Text input

**Date Fields:**
- Valid dates
- Invalid dates (13/32/2024, 02/30/2024)
- Past dates (if not allowed)
- Future dates (if not allowed)
- Format validation (MM/DD/YYYY vs DD/MM/YYYY)

**URL Fields:**
- Valid: https://example.com, http://example.com
- Invalid: example.com, htp://example, www.example
- Edge case: URLs with query params, anchors

### 3. Length Validation
- Minimum length (too short input)
- Maximum length (extremely long input, >1000 chars)
- Exact required length (if specified)
- Unicode characters and emojis

### 4. Special Character Handling
Test with:
- HTML tags: <script>alert('xss')</script>
- SQL: ' OR '1'='1
- Special chars: !@#$%^&*()_+-={}[]|:";'<>?,./
- Unicode: emojis 😀, Arabic/Chinese/Cyrillic text

### 5. File Upload (if applicable)
- Valid file types
- Invalid file types
- Oversized files
- Zero-byte files
- Files with no extension
- Multiple file upload
- Screenshot upload feedback

### 6. Form Submission
- Test submit button (click, Enter key)
- Verify loading state during submission
- Check for duplicate submission prevention
- Test with slow internet (throttle network)
- Verify success message/redirect
- Check error handling for server errors

### 7. Client vs Server Validation
- Test with browser dev tools (modify HTML)
- Bypass client-side validation
- Verify server-side validation exists
- Check for security vulnerabilities

### 8. UX & Accessibility
- Tab order through fields
- Field focus states
- Error message visibility
- Inline vs. top-of-form error placement
- Success feedback clarity
- Help text and placeholders
- Label association with inputs
- Required field indicators (asterisks)

### 9. Mobile Form Testing
- Touch target sizes
- Input type triggers correct keyboard (email → email keyboard)
- Autofill/autocomplete functionality
- Field visibility when keyboard is open

### 10. Form Reset/Cancel
- Test reset button (if present)
- Test cancel/close functionality
- Verify form data is cleared
- Test browser back button behavior

## Documentation Requirements
For each form tested, document:
- Form name/purpose
- All fields and their types
- Validation rules discovered
- Test cases executed (valid, invalid, edge case)
- Issues found with severity level
- Screenshots of validation errors
- Recommendations for improvements
""",
    "steps_hint": "Find all forms, test each with valid/invalid/edge case inputs, verify error messages, document all validation issues."
}


RESPONSIVE_CHECK: TestTemplate = {
    "name": "Responsive Check",
    "description": "Test site responsiveness across device viewports",
    "system_prompt_addition": """
# Responsive Design Testing Protocol

Your task is to test the website's responsive design across multiple viewport sizes.

## Viewports to Test

### Mobile - 375px width (iPhone SE/iPhone 12)
- Primary mobile testing size
- Most constrained viewport
- Test portrait orientation primarily

### Tablet - 768px width (iPad)
- Mid-range viewport
- Test both portrait and landscape implications

### Desktop - 1280px width (Standard Laptop)
- Common desktop size
- Standard working resolution

### Large Desktop - 1920px width (Full HD)
- Large monitor testing
- Check for excessive whitespace

## What to Check at Each Viewport

### 1. Layout & Structure
- No horizontal scrolling (unless intentional, like carousels)
- Content fits within viewport
- No overlapping elements
- Proper column stacking (multi-column → single column on mobile)
- Navigation transforms appropriately (full menu → hamburger)
- Screenshot layout at each breakpoint

### 2. Typography
- Font sizes are readable (minimum 16px on mobile)
- Line lengths are comfortable (45-75 characters ideal)
- Heading hierarchy maintained
- Text doesn't overflow containers
- No cut-off text

### 3. Images & Media
- Images scale appropriately
- No stretched or distorted images
- Aspect ratios maintained
- Images don't overflow containers
- Lazy loading works correctly
- Background images position correctly
- Screenshot image rendering issues

### 4. Navigation
**Mobile:**
- Hamburger menu works
- Menu opens/closes smoothly
- Menu items are accessible
- Touch targets are adequate (minimum 44x44px)
- Sub-menus work correctly

**Desktop:**
- Hover states work
- Dropdown menus align correctly
- Mega menus display properly

### 5. Interactive Elements
- Buttons are appropriately sized
- Touch targets meet minimum size (44x44px)
- Form inputs are comfortable to interact with
- Modals/popups display correctly
- Dropdowns work at all sizes
- Carousels/sliders are functional

### 6. Tables
- Tables scroll horizontally on mobile (or stack responsively)
- Table data remains readable
- Column headers are visible
- Screenshot table behavior

### 7. Forms
- Form fields stack vertically on mobile
- Labels remain associated with inputs
- Field widths are appropriate
- Buttons are full-width on mobile (if appropriate)
- Inline validation messages fit

### 8. Content Hierarchy
- Most important content is prominent
- Less critical content is appropriately de-emphasized
- No content is completely hidden unintentionally
- Whitespace is balanced

### 9. Performance
- Test load time at each viewport
- Check for viewport-specific lazy loading
- Verify appropriate image sizes are served (responsive images)

### 10. Common Responsive Issues to Flag

**Layout Breaks:**
- Fixed widths instead of flexible (%, rem, vw)
- Hardcoded pixel widths
- Missing media queries
- Overflow issues

**Typography Issues:**
- Text too small on mobile (< 16px)
- Text too large on mobile (> 24px for body)
- Inconsistent line heights
- Poor text/background contrast

**Image Issues:**
- Images overflow containers
- Images too large on mobile (performance)
- Incorrect aspect ratios
- Missing responsive images (srcset)

**Navigation Issues:**
- Hamburger menu doesn't work
- Menu doesn't close after selection
- Menu items cut off
- Z-index issues with dropdowns

**Touch Issues (Mobile):**
- Touch targets too small (< 44x44px)
- Hover-only interactions (no mobile alternative)
- Links too close together
- Gesture conflicts

### 11. Testing Methodology
For each page:
1. Start at desktop (1920px)
2. Gradually resize down to mobile (375px)
3. Note breakpoints where layout changes
4. Test at each major breakpoint
5. Screenshot issues at the viewport where they occur
6. Document which viewport size has the issue

## Documentation Requirements
For each issue found, document:
- Viewport size where issue occurs (e.g., "< 768px")
- Element affected (navigation, hero image, form, etc.)
- Description of the issue
- Expected behavior
- Screenshot showing the issue
- Severity (Critical: unusable, High: poor UX, Medium: cosmetic)
- Recommendation for fix

Organize findings by viewport:
- Mobile-specific issues
- Tablet-specific issues
- Desktop-specific issues
- Issues across multiple viewports
""",
    "steps_hint": "Test site at 375px, 768px, 1280px, and 1920px widths. Document layout breaks, text issues, image problems, navigation issues."
}


# Template registry for easy access
TEMPLATES = {
    "full-audit": FULL_AUDIT,
    "signup": SIGNUP_FLOW,
    "checkout": CHECKOUT_FLOW,
    "forms": FORM_VALIDATION,
    "responsive": RESPONSIVE_CHECK,
}


def get_template(template_key: str) -> TestTemplate | None:
    """
    Get a test template by its key.

    Args:
        template_key: The template identifier (e.g., 'full-audit', 'signup')

    Returns:
        TestTemplate dict or None if not found
    """
    return TEMPLATES.get(template_key)


def get_all_templates() -> dict[str, TestTemplate]:
    """
    Get all available test templates.

    Returns:
        Dictionary of all templates
    """
    return TEMPLATES.copy()
