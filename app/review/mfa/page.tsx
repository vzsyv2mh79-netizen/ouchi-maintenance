import './review.css';
import {notFound} from 'next/navigation';
import {MFAReviewPanel} from './review-panel';
export default function MFAReview(){if(process.env.OUCHI_MFA_UI_REVIEW!=='synthetic-only')notFound();return <MFAReviewPanel/>;}
