import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { Resend } from 'resend';

// Load environment variables
dotenv.config();

// Interface for Resend's send method response
interface ResendResponse {
  id?: string;
  error?: any;
}

// Initialize Resend if API key is provided
const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY) 
  : null;

// Create a transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Interface for order details
interface OrderDetails {
  orderId: string;
  customerName: string;
  customerEmail: string;
  modelName: string;
  color: string;
  quantity: number;
  finalPrice: number;
  paymentId: string;
  stlFileName: string;
  stlFileUrl: string;
  shippingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  printingInstructions?: string;
}

/**
 * Send an order confirmation email to the business
 */
export async function sendOrderNotificationEmail(orderDetails: OrderDetails): Promise<boolean> {
  const businessEmail = process.env.BUSINESS_EMAIL || process.env.EMAIL_USER;
  
  if (!businessEmail) {
    console.error('No business email configured for order notifications');
    return false;
  }
  
  // Format the shipping address
  const formatAddress = (address: any) => {
    if (!address) return 'No address provided';
    
    return [
      address.line1,
      address.line2,
      `${address.city}, ${address.state} ${address.postal_code}`,
      address.country
    ].filter(Boolean).join('\n');
  };
  
  // Prepare email content
  const subject = `New 3D Print Order: ${orderDetails.orderId}`;
  
  const htmlContent = `
    <h1>New 3D Print Order</h1>
    <p>A new order has been placed:</p>
    
    <h2>Order Details</h2>
    <ul>
      <li><strong>Order ID:</strong> ${orderDetails.orderId}</li>
      <li><strong>Model:</strong> ${orderDetails.modelName}</li>
      <li><strong>Color:</strong> ${orderDetails.color}</li>
      <li><strong>Quantity:</strong> ${orderDetails.quantity}</li>
      <li><strong>Price:</strong> $${orderDetails.finalPrice.toFixed(2)}</li>
    </ul>
    
    <h2>Customer Information</h2>
    <ul>
      <li><strong>Name:</strong> ${orderDetails.customerName}</li>
      <li><strong>Email:</strong> ${orderDetails.customerEmail}</li>
    </ul>
    
    <h2>Payment Information</h2>
    <ul>
      <li><strong>Payment ID:</strong> ${orderDetails.paymentId}</li>
      <li><strong>Amount:</strong> $${orderDetails.finalPrice.toFixed(2)}</li>
    </ul>
    
    <h2>Shipping Address</h2>
    <pre>${formatAddress(orderDetails.shippingAddress)}</pre>
    
    <h2>Billing Address</h2>
    <pre>${formatAddress(orderDetails.billingAddress)}</pre>
    
    <h2>STL File</h2>
    <p><strong>Filename:</strong> ${orderDetails.stlFileName}</p>
    <p><strong>Download Link:</strong> <a href="${orderDetails.stlFileUrl}">${orderDetails.stlFileUrl}</a></p>
    
    ${orderDetails.printingInstructions ? `
    <h2>Printing Instructions</h2>
    <pre>${orderDetails.printingInstructions}</pre>
    ` : ''}
  `;
  
  try {
    // Try to send with Resend first if available
    if (resend) {
      const result = await resend.emails.send({
        from: `3D Print Orders <orders@modelfosionstudio.com>`,
        to: [businessEmail],
        subject: subject,
        html: htmlContent,
      });
      
      console.log('Order notification email sent with Resend:', result);
      return true;
    } else {
      // Fall back to nodemailer
      const info = await transporter.sendMail({
        from: `"3D Print Orders" <${process.env.EMAIL_USER}>`,
        to: businessEmail,
        subject: subject,
        html: htmlContent,
      });
      
      console.log('Order notification email sent with Nodemailer:', info.messageId);
      return true;
    }
  } catch (error) {
    console.error('Failed to send order notification email:', error);
    return false;
  }
}

/**
 * Send an order confirmation email to the customer
 */
export async function sendCustomerConfirmationEmail(orderDetails: OrderDetails): Promise<boolean> {
  if (!orderDetails.customerEmail) {
    console.error('No customer email provided for confirmation');
    return false;
  }
  
  // Prepare email content
  const subject = `Your 3D Print Order Confirmation - ${orderDetails.orderId}`;
  
  const htmlContent = `
    <h1>Your 3D Print Order Confirmation</h1>
    <p>Thank you for your order! We've received your request and will begin processing it shortly.</p>
    
    <h2>Order Details</h2>
    <ul>
      <li><strong>Order ID:</strong> ${orderDetails.orderId}</li>
      <li><strong>Model:</strong> ${orderDetails.modelName}</li>
      <li><strong>Color:</strong> ${orderDetails.color}</li>
      <li><strong>Quantity:</strong> ${orderDetails.quantity}</li>
      <li><strong>Total:</strong> $${orderDetails.finalPrice.toFixed(2)}</li>
    </ul>
    
    <p>We will ship your order to:</p>
    <pre>${orderDetails.shippingAddress ? [
      orderDetails.shippingAddress.line1,
      orderDetails.shippingAddress.line2,
      `${orderDetails.shippingAddress.city}, ${orderDetails.shippingAddress.state} ${orderDetails.shippingAddress.postal_code}`,
      orderDetails.shippingAddress.country
    ].filter(Boolean).join('\n') : 'No shipping address provided'}</pre>
    
    <p>You will receive updates about your order status at this email address.</p>
    
    <p>If you have any questions, please contact our customer support.</p>
    
    <p>Thank you for choosing our 3D printing service!</p>
  `;
  
  try {
    // Try to send with Resend first if available
    if (resend) {
      const result = await resend.emails.send({
        from: `3D Print Orders <orders@modelfosionstudio.com>`,
        to: [orderDetails.customerEmail],
        subject: subject,
        html: htmlContent,
      });
      
      console.log('Customer confirmation email sent with Resend:', result);
      return true;
    } else {
      // Fall back to nodemailer
      const info = await transporter.sendMail({
        from: `"3D Print Orders" <${process.env.EMAIL_USER}>`,
        to: orderDetails.customerEmail,
        subject: subject,
        html: htmlContent,
      });
      
      console.log('Customer confirmation email sent with Nodemailer:', info.messageId);
      return true;
    }
  } catch (error) {
    console.error('Failed to send customer confirmation email:', error);
    return false;
  }
} 