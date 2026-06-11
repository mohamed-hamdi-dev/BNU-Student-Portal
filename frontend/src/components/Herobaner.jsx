import React from "react";

const Basic = () => (
    <div>
        <div className="herobaner-container   w-[100%]  h-[100%] relative  ">
            <img className="w-[1550px] " src="./public/assets/images/BNU-build.jpg" alt="" />

            <div className="herobaner absolute  top-0  left-0  w-full  h-full  flex flex-col  items-center  justify-center  gap-1">
                <div className="logo-container flex items-center justify-end w-full  gap-1  ">
                    <div className="logo-text">
                        <h1
                            className="   text-[2em] font-[700]    text-[#05ADCF]  drop-shadow-[0_4px_6px_rgba(0,0,0,0.3)]  tracking-wide  animate-[fadeIn_1.2s_ease-in-out]">    جامعة بنها الأهلية    </h1>
                    </div>
                    <div
                        className="w-[6em] h-[6em] text-transparent bg-clip-text drop-shadow-[0_4px_6px_rgba(0,0,0,0.3)] tracking-wide  animate-[fadeIn_1.2s_ease-in-out] ">
                        <img src="/assets/images/logo.png" alt="" />
                    </div>
                </div>
            </div>
        </div>
    </div>
);

export default Basic;
