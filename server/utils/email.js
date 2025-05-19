const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendVerificationEmail(to, link) {
  const mailOptions = {
    from: `"AI-Investor" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Verify your email address',
    html: `<p>Thank you for signing up! Please verify your email by clicking the link below:</p>
           <a href="${link}">${link}</a>`,
  };

  await transporter.sendMail(mailOptions);
}

async function sendPasswordResetEmail(to, link) {
  const mailOptions = {
    from: `"AI-Investor" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Reset your password',
    html: `<p>You requested a password reset. Please click the link below to reset your password:</p>
           <p>This link is valid for 1 hour.</p>
           <a href="${link}">${link}</a>
           <p>If you didn't request this, please ignore this email.</p>`,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail }; 