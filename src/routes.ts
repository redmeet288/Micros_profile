import { Router } from "express";
import { ProfileController } from "./controllers/profile.controller";
import { authMiddleware } from "./authMiddleware";

const router = Router();
const controller = new ProfileController();

router.post(
  "/create_profile/:userUuid",
  controller.createProfileByUserUuid.bind(controller),
);
router.get(
  "/username/:username/userUuid",
  controller.getUserUuidByUsername.bind(controller), //юзлес
);

router.use(authMiddleware);

router.get("/user/:userUuid", controller.getProfileByUserUuid.bind(controller));
router.get("/me", controller.getMe.bind(controller));

router.patch("/me", controller.update.bind(controller));
router.post("/telegram", controller.connectTelegram.bind(controller));
router.patch(
  "/roles/:userUuid",
  controller.setRolesByUserUuid.bind(controller),
);

export default router;
