const express = require("express");
const joi = require("joi");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const _ = require("lodash");
const auth = require("../middlewares/auth");
const User = require("../models/User");

const router = express.Router();

const loginSchema = joi.object({
    email: joi.string().required().email(),
    password: joi.string().required().min(8).regex(/^.*(?=.{8,})((?=.*[!@#$%^&*()\-_=+{};:,<.>]){1})(?=.*\d)((?=.*[a-z]){1})((?=.*[A-Z]){1}).*$/)
});

const userTypeSchema = joi.object({
    userType: joi.string().required()
});

const userJoiSchema = joi.object({
    name: {
        first: joi.string().required().min(2),
        middle: joi.string().allow(''),
        last: joi.string().required().min(2)
    },
    phone: joi.string().required().min(4).max(13),
    email: joi.string().required().email(),
    password: joi.string().optional(),
    address: {
        state: joi.string().allow(''),
        country: joi.string().required().min(2),
        city: joi.string().required().min(2),
        street: joi.string().required().min(2),
        houseNumber: joi.number().required().min(0),
        zip: joi.string().allow('')
    },
    image: {
        url: joi.string().allow(''),
        alt: joi.string().allow('')
    },
    gender: joi.string(),
    userType: joi.string().required(),
    suspended: joi.date(),
    loginAttempts: joi.number()
});

router.post("/", async (req, res) => {
    try {
        const { error } = userJoiSchema.validate(req.body);
        if (error) return res.status(400).send(error);

        let user = await User.findOne({ email: req.body.email });
        if (user) return res.status(400).send("User already exists!");

        user = new User(req.body);

        let salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
        await user.save();

        const token = jwt.sign({ _id: user._id, name: user.name, email: user.email, phone: user.phone, address: user.address, gender: user.gender, userType: user.userType }, process.env.jwtKey);

        res.status(201).send(token);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post("/login", async (req, res) => {
    try {
        const { error } = loginSchema.validate(req.body);
        if (error) return res.status(400).send(error);

        const user = await User.findOne({ email: req.body.email });
        if (!user) return res.status(404).send("User does not exist!");

        if ((user.suspended.getTime() - Date.now()) < 0) {
            if (user.loginAttempts < 3) {
                const result = await bcrypt.compare(req.body.password, user.password);
                if (!result && user.userType != "admin") {
                    user.loginAttempts += 1;
                    await user.save();
                    return res.status(400).send(`Wrong password! ${3 - user.loginAttempts} attempts left!`);
                } else if (!result && user.userType == "admin") {
                    return res.status(400).send("Wrong password!");
                } else {
                    user.loginAttempts = 0;
                    await user.save();
                }
            } else {
                let suspendTime = new Date();
                suspendTime.setTime(Date.now() + 24 * 60 * 60 * 1000);
                user.suspended = suspendTime;
                user.loginAttempts = 0;
                await user.save();
                return res.status(400).send(`Your user has been banned until ${user.suspended}`);
            }
        } else return res.status(400).send(`Your user has been banned until ${user.suspended}`);

        const token = jwt.sign({ _id: user._id, name: user.name, email: user.email, phone: user.phone, address: user.address, gender: user.gender, userType: user.userType, suspended: user.suspended }, process.env.jwtKey);

        res.status(200).send(token);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.get("/", async (req, res) => {
    try {
        let users = await User.find();
        if (!users) return res.status(404).send("No users available!");

        users = _.map(users, (user) => _.pick(user, ["_id", "name", "email", "phone", "address", "image", "gender", "userType", "suspended"]));

        res.status(200).send(users);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.get("/:id", auth, async (req, res) => {
    try {
        let user = await User.findById(req.params.id);
        if (!user) return res.status(404).send("User does not exist!");

        res.status(200).send(_.pick(user, ["_id", "name", "email", "phone", "address", "image", "gender", "userType", "suspended"]));
    } catch (error) {
        res.status(400).send(error);
    }
});

router.put("/:id", auth, async (req, res) => {
    try {
        const { error } = User.validate(req.body);
        if (error) return res.status(400).send(error);

        let user = await User.findOneAndUpdate(
            {
                _id: req.params.id
            },
            req.body,
            { new: true }
        );

        if (!user) return res.status(404).send("User does not exists!");

        res.status(200).send(user);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.patch("/:id", auth, async (req, res) => {
    try {
        let user = await User.findOne({ _id: req.params.id });
        if (!user) return res.status(404).send("User does not exist!");

        let suspendTime = new Date();

        const { error } = userTypeSchema.validate(req.body);
        if (!error) user.userType = req.body.userType;
        else {
            if (req.body.suspendTime > 0) {
                suspendTime.setTime(Date.now() + req.body.suspendTime * 60 * 60 * 1000);
                user.suspended = suspendTime;
            } else user.suspended = suspendTime;
        }
        await user.save();

        res.status(200).send(user);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.delete("/:id", auth, async (req, res) => {
    try {
        let user = await User.findByIdAndDelete({ _id: req.params.id });
        if (!user) return res.status(404).send("User does not exist!");

        res.status(200).send(user);
    } catch (error) {
        res.status(400).send(error);
    }
})

module.exports = router;