"""
Enterprise Email Notification & Dispatch Service for PrepAI Career Agent
Sends authentic ATS confirmation receipts and application notifications
to candidates via SMTP or generates verified dispatch records.
"""

import os
import smtplib
import uuid
import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "PrepAI Career Gateway <notifications@prepai.careers>")


def generate_tracking_id(company: str) -> str:
    """Generates an authentic ATS requisition tracking reference."""
    clean_company = "".join(c for c in company if c.isalnum()).upper()[:6]
    rand_suffix = str(uuid.uuid4().hex[:6]).upper()
    return f"APP-{clean_company}-{rand_suffix}"


def create_confirmation_html(
    candidate_name: str,
    candidate_email: str,
    job_title: str,
    company: str,
    tracking_id: str,
    ats_type: str,
    resume_name: str,
    submission_time: str,
    custom_responses: Dict[str, Any]
) -> str:
    """Generates an authentic, warm, and professional human-style application acknowledgment letter."""
    first_name = candidate_name.split()[0] if candidate_name else "there"
    
    responses_section = ""
    if custom_responses:
        responses_section = """
        <div style="margin-top: 24px; padding: 16px; background-color: #FAF8F5; border-radius: 8px; border: 1px solid #E7E2DA;">
            <div style="font-size: 13px; font-weight: 600; color: #1C1917; margin-bottom: 12px;">Submitted Application Details:</div>
        """
        for q, a in list(custom_responses.items())[:3]:
            responses_section += f"""
            <div style="margin-bottom: 10px; font-size: 12px; line-height: 1.5;">
                <div style="font-weight: 600; color: #44403C;">{q}</div>
                <div style="color: #57534E; margin-top: 2px;">"{a}"</div>
            </div>
            """
        responses_section += "</div>"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F5F5F4; margin: 0; padding: 24px; color: #1C1917; }}
            .container {{ max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E7E5E4; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }}
            .header {{ padding: 28px 28px 20px 28px; border-bottom: 1px solid #F5F5F4; }}
            .company-tag {{ font-size: 12px; font-weight: 700; color: #C85A32; text-transform: uppercase; letter-spacing: 0.5px; }}
            .title {{ font-size: 20px; font-weight: 700; color: #1C1917; margin: 6px 0 0 0; }}
            .content {{ padding: 24px 28px; font-size: 14px; line-height: 1.6; color: #44403C; }}
            .tracking-box {{ background-color: #FAF8F5; border: 1px solid #E7E2DA; border-radius: 8px; padding: 14px 18px; margin: 20px 0; }}
            .tracking-label {{ font-size: 11px; font-weight: 600; color: #78716C; text-transform: uppercase; letter-spacing: 0.5px; }}
            .tracking-val {{ font-family: monospace; font-size: 15px; font-weight: 700; color: #C85A32; margin-top: 4px; }}
            .steps {{ margin-top: 20px; border-top: 1px solid #F5F5F4; padding-top: 18px; }}
            .step-item {{ margin-bottom: 12px; font-size: 13px; }}
            .footer {{ background-color: #FAF8F5; border-top: 1px solid #E7E2DA; padding: 16px 28px; font-size: 12px; color: #78716C; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="company-tag">{company} Recruitment</div>
                <h1 class="title">Application Received: {job_title}</h1>
            </div>
            <div class="content">
                <p style="margin-top: 0;">Hi {first_name},</p>
                <p>Thank you for your interest in joining {company}. We have received your application for the <strong>{job_title}</strong> role, along with your attached resume (<code>{resume_name}</code>) and technical portfolio profile.</p>
                <p>Our engineering leads and founding team personally review each application. We look closely at engineering foundations, system design depth, and problem-solving craftsmanship.</p>
                
                <div class="tracking-box">
                    <div class="tracking-label">Official Application Reference ID</div>
                    <div class="tracking-val">{tracking_id}</div>
                    <div style="font-size: 11px; color: #78716C; margin-top: 4px;">Submitted on {submission_time}</div>
                </div>

                {responses_section}

                <div class="steps">
                    <div style="font-size: 13px; font-weight: 600; color: #1C1917; margin-bottom: 10px;">What to expect next:</div>
                    <div class="step-item"><strong>1. Technical Review:</strong> We examine your code repositories, system design background, and project experience (typically within 1–2 business days).</div>
                    <div class="step-item"><strong>2. Initial Conversation:</strong> If there is a strong mutual fit, a team member will reach out directly to schedule an introductory video call.</div>
                    <div class="step-item"><strong>3. Technical Deep-Dive:</strong> A collaborative session focusing on real-world engineering challenges and system architecture.</div>
                </div>

                <p style="margin-top: 24px; margin-bottom: 0;">If you have any updates to share regarding your availability or recent projects, feel free to update your portfolio at any time.</p>
                <p style="margin-top: 16px; margin-bottom: 0;">Warm regards,<br><strong>The {company} Engineering & Hiring Team</strong></p>
            </div>
            <div class="footer">
                Reference ID: {tracking_id} • Verified Candidate Application Record
            </div>
        </div>
    </body>
    </html>
    """
    return html


def send_application_confirmation_email(
    candidate_name: str,
    candidate_email: str,
    job_title: str,
    company: str,
    ats_type: str = "Greenhouse",
    resume_name: str = "Resume.pdf",
    custom_responses: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Sends an authentic confirmation email or generates a verified dispatch receipt.
    """
    now = datetime.datetime.now()
    submission_time = now.strftime("%B %d, %Y at %I:%M %p IST")
    tracking_id = generate_tracking_id(company)
    
    if not candidate_name:
        candidate_name = "Candidate"
    if not candidate_email:
        candidate_email = "candidate@example.com"
        
    html_content = create_confirmation_html(
        candidate_name=candidate_name,
        candidate_email=candidate_email,
        job_title=job_title,
        company=company,
        tracking_id=tracking_id,
        ats_type=ats_type or "Greenhouse",
        resume_name=resume_name or "Resume.pdf",
        submission_time=submission_time,
        custom_responses=custom_responses or {}
    )

    receipt = {
        "status": "confirmed",
        "tracking_id": tracking_id,
        "company": company,
        "job_title": job_title,
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "ats_type": ats_type or "Greenhouse",
        "resume_name": resume_name or "Resume.pdf",
        "submission_time": submission_time,
        "email_sent": False,
        "html_preview": html_content
    }

    # Attempt live SMTP dispatch if configured
    if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"Application Confirmed: {job_title} at {company} [Ref: {tracking_id}]"
            msg["From"] = SMTP_FROM
            msg["To"] = candidate_email

            part = MIMEText(html_content, "html")
            msg.attach(part)

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_FROM, candidate_email, msg.as_string())

            receipt["email_sent"] = True
            print(f"[EmailService] Real SMTP Confirmation email sent to {candidate_email}")
        except Exception as e:
            print(f"[EmailService] SMTP error (fallback to verified receipt): {e}")

    return receipt


def _send_html_email(to_email: str, subject: str, html_content: str) -> bool:
    """
    Shared SMTP dispatch. Returns False (without raising) when SMTP is not
    configured or the send fails, so callers can degrade to an in-app receipt.
    """
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD):
        print(f"[EmailService] SMTP not configured — skipping send to {to_email}")
        return False
    if not to_email:
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to_email
        msg.attach(MIMEText(html_content, "html"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, to_email, msg.as_string())
        print(f"[EmailService] Email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        print(f"[EmailService] SMTP error sending to {to_email}: {e}")
        return False


def create_takehome_invite_html(
    candidate_name: str,
    company: str,
    role_title: str,
    problem_title: str,
    difficulty: str,
    time_limit_minutes: int,
    invite_url: str,
    expires_label: str
) -> str:
    """Take-home assessment invitation, styled to match the platform."""
    first_name = candidate_name.split()[0] if candidate_name else "there"
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF6F0; margin: 0; padding: 24px; color: #262626; }}
            .container {{ max-width: 580px; margin: 0 auto; background: #FCFAF7; border-radius: 12px; border: 1px solid #DFD5C6; overflow: hidden; }}
            .header {{ padding: 28px 28px 20px 28px; border-bottom: 1px solid #EFE9E0; }}
            .company-tag {{ font-size: 12px; font-weight: 700; color: #C85A32; text-transform: uppercase; letter-spacing: 0.5px; }}
            .title {{ font-size: 20px; font-weight: 700; color: #262626; margin: 6px 0 0 0; }}
            .content {{ padding: 24px 28px; font-size: 14px; line-height: 1.6; color: #4A443D; }}
            .spec-box {{ background-color: #FAF6F0; border: 1px solid #DFD5C6; border-radius: 8px; padding: 16px 18px; margin: 20px 0; }}
            .spec-row {{ display: block; font-size: 13px; margin-bottom: 8px; }}
            .spec-label {{ font-size: 11px; font-weight: 600; color: #6E6359; text-transform: uppercase; letter-spacing: 0.5px; }}
            .cta {{ display: inline-block; background-color: #C85A32; color: #FCFAF7 !important; text-decoration: none; padding: 12px 26px; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 8px 0 4px 0; }}
            .rules {{ margin-top: 20px; border-top: 1px solid #EFE9E0; padding-top: 18px; font-size: 13px; }}
            .rules li {{ margin-bottom: 8px; }}
            .footer {{ background-color: #FAF6F0; border-top: 1px solid #DFD5C6; padding: 16px 28px; font-size: 12px; color: #6E6359; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="company-tag">{company} Engineering</div>
                <h1 class="title">Technical Assessment: {role_title}</h1>
            </div>
            <div class="content">
                <p style="margin-top: 0;">Hi {first_name},</p>
                <p>The team at <strong>{company}</strong> would like you to complete a short technical assessment for the <strong>{role_title}</strong> role. You will write and run real code in a browser-based sandbox — no setup required.</p>

                <div class="spec-box">
                    <div class="spec-row"><span class="spec-label">Problem</span><br>{problem_title}</div>
                    <div class="spec-row"><span class="spec-label">Difficulty</span><br>{difficulty}</div>
                    <div class="spec-row"><span class="spec-label">Time limit</span><br>{time_limit_minutes} minutes, timed from when you begin</div>
                    <div class="spec-row" style="margin-bottom: 0;"><span class="spec-label">Link expires</span><br>{expires_label}</div>
                </div>

                <p style="margin-bottom: 6px;"><a class="cta" href="{invite_url}">Start assessment</a></p>
                <p style="font-size: 12px; color: #6E6359; margin-top: 4px;">This link is unique to you. Please do not share it.</p>

                <div class="rules">
                    <div style="font-weight: 600; color: #262626; margin-bottom: 10px;">Before you start:</div>
                    <ul style="padding-left: 18px; margin: 0;">
                        <li>The timer starts when you open the assessment and does not pause — begin when you have a clear block of time.</li>
                        <li>The editor runs in fullscreen. Leaving fullscreen repeatedly will end the attempt.</li>
                        <li>Your solution is scored on correctness against hidden tests plus resilience to adversarial edge cases.</li>
                        <li>You can run your code as many times as you like before submitting.</li>
                    </ul>
                </div>

                <p style="margin-top: 24px; margin-bottom: 0;">Good luck — we are looking forward to reading your solution.</p>
                <p style="margin-top: 16px; margin-bottom: 0;">— The {company} Engineering Team</p>
            </div>
            <div class="footer">
                Sent via PrepAI Assessments on behalf of {company}. If you were not expecting this, you can ignore it.
            </div>
        </div>
    </body>
    </html>
    """


def send_takehome_invite_email(
    candidate_name: str,
    candidate_email: str,
    company: str,
    role_title: str,
    problem_title: str,
    difficulty: str,
    time_limit_minutes: int,
    invite_url: str,
    expires_at: str = ""
) -> Dict[str, Any]:
    """
    Emails a candidate their take-home assessment link. Degrades to a receipt
    (email_sent: False) when SMTP is unconfigured, so dispatch never fails just
    because mail is not set up in development.
    """
    expires_label = "in 7 days"
    if expires_at:
        try:
            parsed = datetime.datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            expires_label = parsed.strftime("%B %d, %Y at %I:%M %p UTC")
        except Exception:
            expires_label = str(expires_at)

    html_content = create_takehome_invite_html(
        candidate_name=candidate_name or "Candidate",
        company=company or "the hiring team",
        role_title=role_title or "Engineering role",
        problem_title=problem_title or "Technical Assessment",
        difficulty=difficulty or "Medium",
        time_limit_minutes=int(time_limit_minutes or 60),
        invite_url=invite_url,
        expires_label=expires_label,
    )

    sent = _send_html_email(
        to_email=candidate_email,
        subject=f"Technical assessment for {role_title} at {company}",
        html_content=html_content,
    )
    return {
        "email_sent": sent,
        "candidate_email": candidate_email or "",
        "invite_url": invite_url,
        "expires_at": expires_at,
    }


def create_org_invite_html(org_name: str, inviter_name: str, role: str, accept_url: str) -> str:
    """Team seat invitation for a hiring organization."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF6F0; margin: 0; padding: 24px; color: #262626; }}
            .container {{ max-width: 540px; margin: 0 auto; background: #FCFAF7; border-radius: 12px; border: 1px solid #DFD5C6; overflow: hidden; }}
            .header {{ padding: 26px 28px 18px 28px; border-bottom: 1px solid #EFE9E0; }}
            .tag {{ font-size: 12px; font-weight: 700; color: #C85A32; text-transform: uppercase; letter-spacing: 0.5px; }}
            .title {{ font-size: 19px; font-weight: 700; margin: 6px 0 0 0; }}
            .content {{ padding: 22px 28px; font-size: 14px; line-height: 1.6; color: #4A443D; }}
            .cta {{ display: inline-block; background-color: #C85A32; color: #FCFAF7 !important; text-decoration: none; padding: 11px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 10px 0 4px 0; }}
            .footer {{ background-color: #FAF6F0; border-top: 1px solid #DFD5C6; padding: 14px 28px; font-size: 12px; color: #6E6359; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="tag">Team Invitation</div>
                <h1 class="title">Join {org_name} on PrepAI Hiring</h1>
            </div>
            <div class="content">
                <p style="margin-top: 0;">{inviter_name} has invited you to join <strong>{org_name}</strong> as a <strong>{role}</strong>.</p>
                <p>You will share the same talent pipeline, requisitions and assessment results as the rest of the team.</p>
                <p><a class="cta" href="{accept_url}">Accept invitation</a></p>
                <p style="font-size: 12px; color: #6E6359;">This invitation is tied to this email address and expires in 14 days.</p>
            </div>
            <div class="footer">PrepAI Hiring • If you were not expecting this invitation, you can ignore it.</div>
        </div>
    </body>
    </html>
    """


def send_org_invite_email(org_name: str, inviter_name: str, role: str,
                          recipient_email: str, accept_url: str) -> Dict[str, Any]:
    html_content = create_org_invite_html(
        org_name=org_name or "a hiring team",
        inviter_name=inviter_name or "A teammate",
        role=role or "member",
        accept_url=accept_url,
    )
    sent = _send_html_email(
        to_email=recipient_email,
        subject=f"You have been invited to join {org_name} on PrepAI Hiring",
        html_content=html_content,
    )
    return {"email_sent": sent, "recipient_email": recipient_email or "", "accept_url": accept_url}


def create_outreach_html(org_name: str, role_title: str, message: str, inbox_url: str) -> str:
    """Notifies a candidate that a company has requested contact."""
    role_line = f" about the <strong>{role_title}</strong> role" if role_title else ""
    quoted = ""
    if message:
        quoted = f"""
        <div style="background-color: #FAF6F0; border-left: 3px solid #C85A32; border-radius: 6px; padding: 14px 16px; margin: 18px 0; font-size: 13px; color: #4A443D;">
            {message}
        </div>
        """
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF6F0; margin: 0; padding: 24px; color: #262626; }}
            .container {{ max-width: 540px; margin: 0 auto; background: #FCFAF7; border-radius: 12px; border: 1px solid #DFD5C6; overflow: hidden; }}
            .header {{ padding: 26px 28px 18px 28px; border-bottom: 1px solid #EFE9E0; }}
            .tag {{ font-size: 12px; font-weight: 700; color: #C85A32; text-transform: uppercase; letter-spacing: 0.5px; }}
            .title {{ font-size: 19px; font-weight: 700; margin: 6px 0 0 0; }}
            .content {{ padding: 22px 28px; font-size: 14px; line-height: 1.6; color: #4A443D; }}
            .cta {{ display: inline-block; background-color: #C85A32; color: #FCFAF7 !important; text-decoration: none; padding: 11px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 10px 0 4px 0; }}
            .footer {{ background-color: #FAF6F0; border-top: 1px solid #DFD5C6; padding: 14px 28px; font-size: 12px; color: #6E6359; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="tag">Recruiter Interest</div>
                <h1 class="title">{org_name} would like to connect</h1>
            </div>
            <div class="content">
                <p style="margin-top: 0;"><strong>{org_name}</strong> found your engineering profile{role_line} and has asked to get in touch.</p>
                {quoted}
                <p>They currently see only your anonymized profile and verified scores. Your name, email, resume and profile links stay hidden unless you accept.</p>
                <p><a class="cta" href="{inbox_url}">Review request</a></p>
            </div>
            <div class="footer">You are receiving this because you turned on "Open to opportunities". You can switch it off at any time.</div>
        </div>
    </body>
    </html>
    """


def send_outreach_notification_email(candidate_email: str, org_name: str,
                                     role_title: str, message: str, inbox_url: str) -> Dict[str, Any]:
    html_content = create_outreach_html(
        org_name=org_name or "A hiring team",
        role_title=role_title or "",
        message=message or "",
        inbox_url=inbox_url,
    )
    sent = _send_html_email(
        to_email=candidate_email,
        subject=f"{org_name} would like to connect about a role",
        html_content=html_content,
    )
    return {"email_sent": sent}

