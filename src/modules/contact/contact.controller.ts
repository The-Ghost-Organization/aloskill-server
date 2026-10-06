import catchAsync from '../../utils/asyncHandler.js';
import ResponseHandler from '../../utils/response.js';
import { contactService } from './contact.service.js';

const submit = catchAsync(async (req, res) => {
  const result = await contactService.submit(req);
  return ResponseHandler.accepted(res, 'Your message has been received.', result);
});

export const contactController = { submit };
