/**
 * @api {get} /api/products Get all products with verification
 * @apiName GetAllProducts
 * @apiGroup Products
 * @apiVersion 1.0.0
 *
 * @apiParam {String} [id] Product ID for filtering
 * @apiParam {String} [member_id] Member ID for filtering
 * @apiParam {Number} [page=1] Page number for pagination
 * @apiParam {Number} [pageSize=10] Items per page
 *
 * @apiSuccess {Boolean} success Indicates if the request was successful
 * @apiSuccess {Object} pagination Pagination information (if no specific ID was requested)
 * @apiSuccess {Number} pagination.page Current page number
 * @apiSuccess {Number} pagination.pageSize Items per page
 * @apiSuccess {Number} pagination.totalCount Total number of items
 * @apiSuccess {Number} pagination.totalPages Total number of pages
 * @apiSuccess {Boolean} pagination.hasNext Whether there is a next page
 * @apiSuccess {Boolean} pagination.hasPrevious Whether there is a previous page
 * @apiSuccess {Object[]} data List of products with verification data
 * 
 * @apiSuccess {Object} data.parsedData Parsed and extracted data from product fields
 * @apiSuccess {Object} data.parsedData.gpc Parsed GPC information
 * @apiSuccess {String} data.parsedData.gpc.code Extracted GPC code
 * @apiSuccess {String} data.parsedData.gpc.title GPC title/name
 * @apiSuccess {String} data.parsedData.gpc.definition GPC detailed definition (if available from DB)
 * @apiSuccess {String} data.parsedData.gpc.id Database record ID (if available from DB)
 * @apiSuccess {Number} data.parsedData.gpc.gpcClassId GPC class ID (if available from DB)
 * @apiSuccess {Object} data.parsedData.unit Parsed unit information
 * @apiSuccess {String} data.parsedData.unit.code Unit code (e.g., 'KG', 'LTR')
 * @apiSuccess {String} data.parsedData.unit.name Full unit name (e.g., 'Kilogram', 'Liter')
 * @apiSuccess {String} data.parsedData.unit.type Unit type (e.g., 'weight', 'volume', 'quantity')
 * 
 * @apiSuccess {Object} data.verification AI-based verification results
 * @apiSuccess {Boolean} data.verification.isValid Whether the product data is valid
 * @apiSuccess {Number} data.verification.verificationScore Verification score (0-100)
 * @apiSuccess {Number} data.verification.confidenceLevel AI confidence level (0-100)
 * @apiSuccess {String} data.verification.verificationStatus Status ('verified' or 'unverified')
 * @apiSuccess {Object[]} data.verification.issues List of validation issues
 * @apiSuccess {String[]} data.verification.missingFields List of missing required fields
 * @apiSuccess {Object[]} data.verification.aiSuggestions Suggestions for improvement
 *
 * @apiSuccessExample {json} Success-Response (Single Product):
 *     HTTP/1.1 200 OK
 *     {
 *       "success": true,
 *       "data": {
 *         "id": "DE069C7B-C58B-457E-9FAB-73F1B49AE079",
 *         "member_id": "1808",
 *         "productnameenglish": "PROMAX SP 0W16 API SP",
 *         "BrandName": "SAMA OIL",
 *         "unit": "LTR",
 *         "front_image": "\\emberProductsImages\\front_image-173.jpg",
 *         "gpc": "20002871-Type of Engine Oil Target",
 *         "parsedData": {
 *           "gpc": {
 *             "code": "20002871",
 *             "title": "Type of Engine Oil Target",
 *             "definition": "Defines the product category for different types of engine oils",
 *             "id": "95",
 *             "gpcClassId": 95
 *           },
 *           "unit": {
 *             "code": "LTR",
 *             "name": "Liter",
 *             "type": "volume"
 *           }
 *         },
 *         "verification": {
 *           "isValid": true,
 *           "verificationScore": 100,
 *           "confidenceLevel": 95,
 *           "verificationStatus": "verified",
 *           "issues": [],
 *           "missingFields": [],
 *           "aiSuggestions": [
 *             {
 *               "field": "enhancementTip",
 *               "suggestion": "Consider adding technical specifications such as viscosity grade and API certification in the product description to provide more valuable information to potential customers.",
 *               "importance": "Low"
 *             }
 *           ]
 *         }
 *       }
 *     }
 *
 * @apiError {Boolean} success Always false on error
 * @apiError {String} message Error message
 * @apiError {String} error Error type
 *
 * @apiErrorExample {json} Error-Response:
 *     HTTP/1.1 404 Not Found
 *     {
 *       "success": false,
 *       "message": "No products found with the provided criteria"
 *     }
 */ 